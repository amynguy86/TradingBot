import { StreamMessage, TickerMessage } from 'gdax-trading-toolkit/build/src/core';
import { AlgoConfig } from './TradingAlgo';
import { Settings } from './Settings';
import { OrderManager } from "./OrderManager"
import { ExchangeFeedConfig, GDAXFeed } from 'gdax-trading-toolkit/build/src/exchanges';
import * as GTT from 'gdax-trading-toolkit';
import { TraderConfig } from 'gdax-trading-toolkit/build/src/core';
import { BigJS } from '../../gdax-tt/build/src/lib/types';
import { BigNumber } from '../../gdax-tt/node_modules/bignumber.js';
import { tempdir } from 'shelljs';

class RefPoint {
    price: BigJS;
    time: Date;
}

export interface AlgoConfig {
    product: string,
    logger: any,
    feedConfig: ExchangeFeedConfig
}

interface AlgoEquation {
    m: number
    b: number
}

export class TradingAlgo {
    private currRefPoint: RefPoint = new RefPoint();
    private prevRefPoint: RefPoint = new RefPoint();
    private initRefPoint: boolean = false;
    private buyEquation: AlgoEquation;
    private sellEquation: AlgoEquation;
    private orderManager: OrderManager;
    private readonly algoConfig: AlgoConfig;
    private logger: any;
    private initAlgo: boolean = false;
    private i:number=0;
    constructor(config: AlgoConfig) {
        this.algoConfig = config;
        this.logger = this.algoConfig.logger;
        this.buyEquation = this.calcFormulaVar(Settings.buySettings);
        this.sellEquation = this.calcFormulaVar(Settings.sellSettings);
    }

    private calcFormulaVar(settings: any): AlgoEquation {
        //calc slope
        let eq: AlgoEquation = { m: 0, b: 0 };
        eq.m = (settings.tradeRateMax - settings.tradeRateMin) / (settings.slopeMax - settings.slopeMin);
        eq.b = settings.tradeRateMax - (eq.m * settings.slopeMax);
        return eq;
    }

    init(): Promise<boolean> {
        if (this.initAlgo)
            return Promise.reject("Algo Is already up");

        this.initAlgo = true;
        return new Promise((resolve, reject) => {
            this.logger.log('info', `BuyEq:${JSON.stringify(this.buyEquation)},SellEq:${JSON.stringify(this.sellEquation)} `)

            GTT.Factories.GDAX.getSubscribedFeeds(this.algoConfig.feedConfig, [this.algoConfig.product]).then((feed: GDAXFeed) => {
                const traderConfig: TraderConfig = {
                    logger: this.logger,
                    productId: this.algoConfig.product,
                    exchangeAPI: feed.authenticatedAPI,
                    fitOrders: false
                };
                this.orderManager = new OrderManager(traderConfig, feed, this.algoConfig.product);
                feed.on('data', (msg: StreamMessage) => {
                    if (msg.type === "ticker") {
                        let ticker = <TickerMessage>msg;
                        //this.logger.log('debug',`Ticker: ${JSON.stringify(msg)}`);

                        if (isNaN(ticker.time.valueOf()))
                            return;

                        if (!this.initRefPoint) {
                            if (!msg.time)
                                return;

                            this.setNewRefPoint(ticker.price, msg.time);
                            this.initRefPoint = true;
                            return;
                        }
                                                
                        if ((this.currRefPoint.price.sub(ticker.price).abs().greaterThanOrEqualTo(Settings.pdFilter))) {
                            if (!msg.time)
                                return;
                            
                            if(ticker.time.getTime()-this.currRefPoint.time.getTime()<=0){
                                if(ticker.time.getTime()-this.currRefPoint.time.getTime()<0)
                                    this.logger.log('error',"Ticker time is equal less than currentRefPoint so returning");
                                else
                                    this.logger.log('debug',"Ticker time is equal to currentRefPoint so returning");
                                
                                return;
                            }
                           
                            this.setNewRefPoint(ticker.price, msg.time);
                            this.initiateAlgo();
                            return;
                        }

                    }
                });
                resolve(true);
            }).catch((err: Error) => {
                reject(err);
            });
        });
    }


    private setNewRefPoint(price: BigJS, time: Date) {
        this.prevRefPoint.price = this.currRefPoint.price;
        this.prevRefPoint.time = this.currRefPoint.time;
        this.currRefPoint.price = price;
        this.currRefPoint.time = time;
        this.logger.log('info', `Setting new Reference point to, Price:${this.currRefPoint.price}, Time:${this.currRefPoint.time}`);
    }

    private initiateAlgo() {
        this.logger.log('info', "Initiating Algo");
        let slope = this.calculateSlope();
        let beta;
        let side = "";
        if (slope.lessThan(0)) {
            beta = this.calcBeta(slope.abs(), Settings.sellSettings, this.buyEquation);
            side = "buy";
            this.initiateOrder(Settings.buySettings,side,beta);
        
        }
        else if(slope.greaterThan(0))  {
            beta = this.calcBeta(slope.abs(), Settings.buySettings, this.sellEquation);
            side = "sell";
            this.initiateOrder(Settings.sellSettings,side,beta);
        }
        
        this.logger.log("info", `${side} with ${beta}`);
    }

    private initiateOrder(settings: any, side: string, beta: BigJS) {
        if(beta.greaterThan(1))
            beta=new BigNumber(1);
        else if(beta.lessThan(0))
            beta=new BigNumber(0);
            
        var quantity: BigJS = beta.mul(settings.maxTradeQuantity);
        var makeOrder:boolean =false;
        if(side==='buy'){
            if(quantity.div(this.currRefPoint.price).greaterThanOrEqualTo(Settings.minAmountBase))
                makeOrder=true; 
        }

        else if(side==='sell'){
           if(quantity.greaterThanOrEqualTo(Settings.minAmountBase))
                makeOrder=true;
        }

        if (makeOrder) {
            this.orderManager.makeOrder(side, quantity, this.currRefPoint.price);
        }
    }

    private calculateSlope(): BigJS {
        this.logger.log('debug', `Caluclating slope between ${JSON.stringify(this.currRefPoint)} and ${JSON.stringify(this.prevRefPoint)}`);
        this.logger.log('info',`t2:${this.currRefPoint.time.getTime()}, t1(prev):${this.prevRefPoint.time.getTime()}`);
     
        // Time will be in Seconds
        var num: BigJS = new BigNumber(this.currRefPoint.time.getTime()).sub(this.prevRefPoint.time.getTime());
        var slope = this.currRefPoint.price.sub(this.prevRefPoint.price);
        slope = slope.dividedBy(num);
        this.logger.log('debug', `Slope is ${slope.toString()}`);
        return slope;
    }

    private calcBeta(slope: BigJS, settings: any, eq: AlgoEquation): BigJS {
        let beta = slope.abs().mul(eq.m).add(eq.b);
        return beta;
    }
}