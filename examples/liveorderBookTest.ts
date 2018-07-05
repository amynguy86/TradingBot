import { StreamMessage } from 'gdax-trading-toolkit/build/src/core';
/***************************************************************************************************************************
 * @license                                                                                                                *
 * Copyright 2017 Coinbase, Inc.                                                                                           *
 *                                                                                                                         *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance          *
 * with the License. You may obtain a copy of the License at                                                               *
 *                                                                                                                         *
 * http://www.apache.org/licenses/LICENSE-2.0                                                                              *
 *                                                                                                                         *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on     *
 * an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the                      *
 * License for the specific language governing permissions and limitations under the License.                              *
 ***************************************************************************************************************************/

import * as GTT from 'gdax-trading-toolkit';
import { GDAXFeed } from "gdax-trading-toolkit/build/src/exchanges";
import { LiveBookConfig, LiveOrderbook, SkippedMessageEvent, TradeMessage } from "gdax-trading-toolkit/build/src/core";
import { Ticker } from "gdax-trading-toolkit/build/src/exchanges/PublicExchangeAPI";
import { CumulativePriceLevel } from "gdax-trading-toolkit/build/src/lib";
import { PassThrough } from 'stream';
import * as fs from 'fs';
import { Trader, TraderConfig } from '../../gdax-tt/build/src/core/Trader';
import { TradeFinalizedMessage, PlaceOrderMessage } from '../../gdax-tt/build/src/core/Messages';
import { placeOrder } from '../../gdax-tt/build/src/exchanges/bitfinex/BitfinexAuth';

const product = 'LTC-USD';
const logger = GTT.utils.ConsoleLoggerFactory({ level: 'debug' });
const printOrderbook = GTT.utils.printOrderbook;
const printTicker = GTT.utils.printTicker;
/*
 Simple demo that sets up a live order book and then periodically prints some stats to the console.
 */

let tradeVolume: number = 0;

GTT.Factories.GDAX.FeedFactory(logger, [product]).then((feed: GDAXFeed) => {
// Configure the live book object
    const config: LiveBookConfig = {
        product: product,
        logger: logger
    };

    const traderConfig: TraderConfig = {
        logger: logger,
        productId: product,
        exchangeAPI: feed.authenticatedAPI,
        fitOrders: false
    };
    
    var testStream:PassThrough  = new PassThrough();
    const trader = new Trader(traderConfig);
    const book = new LiveOrderbook(config);//.pipe(testStream);
    feed.pipe(book).pipe(trader);
    //testStream.pause();
    //feed.pipe(testStream);
    
    book.on('data',(msg: any)=>{
           //console.log('info:',`Amin: ${JSON.stringify(msg)}`);
    });

    trader.on('Trader.trade-finalized', (msg: TradeFinalizedMessage) => {
        logger.log('info', 'Order complete', JSON.stringify(msg));
    });
    
    book.on('error',(err:any)=>{
        console.log(err);
    });

    trader.on('Trader.place-order-failed', (msg: any) => {
    console.log(msg);
    });

    let placeOrderMessage = {
        type: 'placeOrder',
        productId: product,
        side: 'buy',
        orderType: 'limit',
        postOnly: true,
        size: '0.1',
        price: '3'
    };

    trader.placeOrder(placeOrderMessage as PlaceOrderMessage).then(()=>{
        console.log("Done");
    });

}).catch((err:Error)=>{
    console.log(err.stack);
});

function printOrderbookStats(book: LiveOrderbook) {
    console.log(`Number of bids:       \t${book.numBids}\tasks: ${book.numAsks}`);
    console.log(`Total ${book.baseCurrency} liquidity: \t${book.bidsTotal.toFixed(3)}\tasks: ${book.asksTotal.toFixed(3)}`);
    let orders: CumulativePriceLevel[] = book.ordersForValue('buy', 100, false);
    console.log(`Cost of buying 100 ${book.baseCurrency}: ${orders[orders.length - 1].cumValue.toFixed(2)} ${book.quoteCurrency}`);
    orders = book.ordersForValue('sell', 1000, true);
    console.log(`Need to sell ${orders[orders.length - 1].cumSize.toFixed(3)} ${book.baseCurrency} to get 1000 ${book.quoteCurrency}`);
}
