import { Settings } from '../config/Settings';
import { BigJS } from 'gdax-trading-toolkit/build/src/lib/types';
import { ExchangeFeed } from 'gdax-trading-toolkit/build/src/exchanges';
import { TraderConfig } from 'gdax-trading-toolkit/build/src/core/Trader';
import { Trader, TradeExecutedMessage, TradeFinalizedMessage, PlaceOrderMessage } from "gdax-trading-toolkit/build/src/core";
import { LiveOrder } from "gdax-trading-toolkit/build/src/lib";
import { OrderStore } from './OrderStore';
import { BigNumber } from 'gdax-trading-toolkit/node_modules/bignumber.js';
import { LiveOrderbook } from 'gdax-trading-toolkit/build/src/core/LiveOrderbook';
import { ErrorMessage } from 'gdax-trading-toolkit/build/src/core/Messages';
import {OrderResult}from 'gdax-trading-toolkit/node_modules/gdax';
import { Query, QueryResult } from 'pg';
import HashMap=require('hashmap');

export class OrderManager {
    private trader: Trader;
    private logger: any;
    private product: string;
    private liveOrderbook: LiveOrderbook;
    
    constructor(traderConfig: TraderConfig, feed: ExchangeFeed, product: string) {
        this.logger = traderConfig.logger;
        this.trader = new Trader(traderConfig);
        //The trader code does not read fitOrder propery from config
        this.trader.fitOrders=traderConfig.fitOrders;
        this.product = product;
        this.liveOrderbook= new LiveOrderbook({product:this.product,logger:this.logger});
        feed.pipe(this.liveOrderbook).pipe(this.trader); //This fixed the memory issues, live order now has something to pipe to
        this.setUpTrader();
    }

    private setUpTrader() {
        this.trader.on('Trader.order-placed', (msg: LiveOrder) => {
            this.logger.log('info', 'Order placed', JSON.stringify(msg));
        });
        this.trader.on('Trader.trade-executed', (msg: TradeExecutedMessage) => {
            this.logger.log('info', 'Trade executed', JSON.stringify(msg));
            if (msg.side === 'buy')
                OrderStore.getInstance().addQuantity(msg.price, msg.tradeSize).catch((err: Error) => {
                    this.logger.log('error', err.stack);
                });
        });
        this.trader.on('Trader.trade-finalized', (msg: TradeFinalizedMessage) => {
            this.logger.log('info', 'Order complete', JSON.stringify(msg));
            /*
            This SQL function would also put any unsold amount back into the pool at the correct reference point
            */
            OrderStore.getInstance().markOrderDone(msg).catch((err: Error) => {
                this.logger.log('error', err.stack);
            });
        });

        this.trader.on('Trader.place-order-failed', (msg: ErrorMessage) => {
            this.logger.log('error', msg);
            var result:OrderResult = msg.meta;
            //todo, tries infinite number of times, that is because I have no way of knowing how many times retries happenned,
            //Hopefully the order will eventually go through, we may result in a loss but thats Ok for now
            if((result as any).reject_reason ==='post only'){
                setTimeout(()=>{
                    this.logger.log('error',"Order Rejected because of POST_ONLY, Trying Again: price:"+msg.meta.price);
                    //ReferencePoint is just being given as current price, because this was the price the order got rejected
                    if(result.side==='buy'){
                        this.makeOrder(result.side,new BigNumber(result.size).mul(result.price).round(2),new BigNumber(result.price));
                    }
                    else if(result.side==='sell'){
                        this.makeOrder(result.side,new BigNumber(result.size),new BigNumber(result.price));
                    }
                },2000);
            }
        });
    }

    /*
    Sell "size" much eth/crypto for under or equal to the ref Point they were bought at
    */
    public sellOrder(size: BigJS, price: BigJS,refPoint:BigJS) {
        this.logger.log('info',`OrderManager, selling size:${size}, price:${price}, refPoint:${refPoint}`);
        OrderStore.getInstance().sellOrder(size, refPoint, (quantity: BigJS, refPoint: BigJS) :Promise<BigJS> => {
            let placeOrderMessage = {
                type: 'placeOrder',
                productId: this.product,
                side: 'sell',
                orderType: 'limit',
                postOnly: true,
                size: quantity.toFixed(Settings.decimalPlaces),
                price: price.toFixed(2)
            };


            return this.trader.placeOrder(placeOrderMessage as PlaceOrderMessage).then((order: LiveOrder) => {
                this.logger.log('info', `${JSON.stringify(this.trader.state())}`);
                this.logger.log(`info`,`Placing Sell Order as Part of Transaction(size:${size}, price:${price}, refPoint:${refPoint}), Param:(quantity:${quantity},refpoint:${refPoint})`);
                //Add to orderStore, dont care if add is succesfull(avoids deadlock due to clients running out)
                //BUG:Order complete may come before insertNewOrder happens(unlikely)
                if (order !== null) {
                    OrderStore.getInstance().insertNewOrder(refPoint, order).then(() => {
                        this.logger.log('info',"Sell Order Added");
                    }).catch((err: Error) => {
                        this.logger.log('error', err.stack);
                    });
                    return Promise.resolve(order.size);
                }
                else {
                    return Promise.reject(new Error("Order Placement Failed"));
                }
            }).catch((err: Error) => {
                this.logger.log('Here error', err.message);
                return Promise.reject(new Error("Order Placement Failed"));
            });
        }).then((x:BigJS[])=>{
            var totalOrderSize = x.reduce((accumulator:BigJS,y:BigJS)=>accumulator.add(y),new BigNumber(0));
            this.logger.log('info',`Total Order Size(Sell):${totalOrderSize}, size:${size}, price:${price}, refPoint:${refPoint}`);
            OrderStore.getInstance().printHoldings();
        });
    }
    /*
    Size of $ worth of eth to Buy at the Price given
    */
    public buyOrder(size: BigJS, price: BigJS,refPoint:BigJS) {
        this.logger.log('info',`OrderManager, Buying size:${size}, price:${price}, refPoint:${refPoint}`);
        OrderStore.getInstance().buyOrder(size,(sizeReturned:BigJS):Promise<Number> =>{
            let baseQuantity:BigJS=sizeReturned.dividedBy(price);
            let placeOrderMessage = {
                type: 'placeOrder',
                productId: this.product,
                side: 'buy',
                orderType: 'limit',
                postOnly: true,
                size: baseQuantity.toFixed(Settings.decimalPlaces),
                price: price.toFixed(2)
            };

          return  this.trader.placeOrder(placeOrderMessage as PlaceOrderMessage).then((order: LiveOrder) => {
                let leftOverCash=sizeReturned.minus(order.size.mul(order.price)).toNumber();
                leftOverCash= leftOverCash<0.01? 0 : leftOverCash;
                //Add to orderStore
                if (order !== null){
                    this.logger.log('info', `Order Placed, OrderId: ${JSON.stringify(order)}`);
                    OrderStore.getInstance().insertNewOrder(refPoint, order).then((Query:QueryResult)=>{
                        this.logger.log('info',"Order Added");
                    }).catch((err: Error) => {
                        this.logger.log('error', err.stack);
                    });
                    this.logger.log('info',`Left Over CAsh: ${leftOverCash}`)
                    return Promise.resolve(leftOverCash); //Dont care if insert into database fails
                }
                else{
                    this.logger.log('info', `Buy Order Failed`);
                    return Promise.reject(new Error("Failed to place Order"));
                    }
            }).catch((err: Error) => {
                return Promise.reject(err);
            });
        }).then(()=>{
            OrderStore.getInstance().printHoldings();
        });
    }
    /*
        If Side==buy, quantity is $
        if sell, quantity is eth
    */
    public makeOrder(side:string,quantity:BigJS,refPoint:BigJS){
        if(side==='buy'){
            let adjustedPrice: BigJS = this.liveOrderbook.book.lowestAsk.price.minus(Settings.minSpread);
            this.buyOrder(quantity,adjustedPrice,refPoint);
        }
        else if(side=='sell'){
            let adjustedPrice: BigJS =this.liveOrderbook.book.highestBid.price.add(Settings.minSpread); //Price I wanna sell to
            this.sellOrder(quantity,adjustedPrice,refPoint);
        }
    }

    public cancelAllOrders():void{
        //Todo get this list from the database, not in memory
        this.trader.cancelMyOrders().then((ids)=>{
            this.logger.log('debug',`Following orders were cancelled: ${ids}`)
        }).catch((err:Error)=>{
            this.logger.log('error',err.stack);
        });
    }
}