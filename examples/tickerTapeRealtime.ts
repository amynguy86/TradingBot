import { CumulativePriceLevel, BookBuilder } from 'gdax-trading-toolkit/build/src/lib';
import * as GTT from 'gdax-trading-toolkit';
import { LiveBookConfig, LiveOrderbook, OrderbookMessage, LevelMessage, TradeMessage, TickerMessage, NewOrderMessage, SkippedMessageEvent, StreamMessage } from 'gdax-trading-toolkit/build/src/core';
import { GDAXFeed, ExchangeFeed } from 'gdax-trading-toolkit/build/src/exchanges';
import { Ticker } from 'gdax-trading-toolkit/build/src/exchanges/PublicExchangeAPI';
import { OrderBook } from 'ccxt';
import { Logger } from 'gdax-trading-toolkit/build/src/utils';

const padfloat = GTT.utils.padfloat; 
const products = ['ETH-USD'];
//function FeedFactory(logger: Logger, productIDs?: string[], auth?: GDAXAuthConfig): Promise<GDAXFeed>;
//var tickerMessages : { [key:string]:Ticker; } = {};
//var factories={ [key: string]:Ticker; }={}//: {[key:string]:(logger: Logger,productIDs?: string[]):Promise<ExchangeFeed>;};//= {"GDAX":GTT.Factories.GDAX.FeedFactory};
/*
Side is undefined in Ticker Messages!!!!!
*/
interface Feed {
    (logger: Logger,productIDs?: string[]):Promise<ExchangeFeed>;
}
 
var factories : { [key:string]:Feed} = {"GDAX": GTT.Factories.GDAX.FeedFactory};
//factories["BITFINEX"]=GTT.Factories.Bitfinex.FeedFactory;

const logger = GTT.utils.ConsoleLoggerFactory({ level: 'debug' });

Object.keys(factories).forEach((x)=>{
    factories[x](logger, products).then((feed: ExchangeFeed) => {
        feed.on('data', (msg: StreamMessage) => {
            if (msg.type=="ticker" ) { 
                    printTicker(x,msg as TickerMessage);        
                }
            else if(msg.type=="trade"){
                printTrade(x,<TradeMessage>msg);
            }     
            });

            
    }).catch((err: Error) => {
        logger.log('error', err.message);
        process.exit(1);
    });
});

function printTrade(exchange:String,tradeMsg: TradeMessage){
    console.log("TRADE MESSAGE");
    let s = `${tradeMsg.productId} (${exchange})`;
    for (let i = s.length; i < 24; i++) {
        s += ' ';
    }
    console.log(`${s}\t| ${tradeMsg.price} | ${tradeMsg.side} | ${tradeMsg.size} | ${tradeMsg.tradeId}`);
}

function printTicker(exchange: String, ticker: Ticker) {
    // pad exchange name
    console.log("TICKER MESSAGE");
    let s = `${ticker.productId} (${exchange})`;
    for (let i = s.length; i < 24; i++) {
        s += ' ';
    }
    
    console.log(`${s}\t| ${padfloat(ticker.price, 10, 2)} | ${ticker.side} | ${ticker.volume} | ${ticker.trade_id} | ${padfloat(ticker.bid, 10, 2)} | ${padfloat(ticker.ask, 10, 2)}`);
}
