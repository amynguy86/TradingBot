import { Ticker } from 'gdax-trading-toolkit/build/src/exchanges/PublicExchangeAPI';
import { LiveOrder } from 'gdax-trading-toolkit/build/src/lib';
import * as GTT from 'gdax-trading-toolkit';
import request = require('superagent');
const logger = GTT.utils.ConsoleLoggerFactory({ level: 'debug' });
import { Client, QueryResult } from "pg";
import { DefaultAPI } from 'gdax-trading-toolkit/build/src/factories/gdaxFactories';
import { GDAXExchangeAPI } from 'gdax-trading-toolkit/build/src/exchanges/index';
var api: GDAXExchangeAPI = DefaultAPI(logger);

let client: Client = new Client();
var valWithoutTrading:number;
var valWithTrading:number;
var difference:number;
var originalVal:number;

api.loadTicker('ETH-USD').then((ticker: Ticker) => {
    var price = ticker.price.toNumber();
    return client.connect().then(() => {
        return client.query(`SELECT (sum(amount/price)) as numeth, sum(amount) as value FROM public.funds_load_tracker;`).then((q: QueryResult) => {
            originalVal=q.rows[0].value;
            valWithoutTrading=Number(q.rows[0].numeth) * price;
        }).then(()=>{
            return client.query(`select (select quote_quantity from configuration)+(select sum(quantity) * ${price} from holdings_value_tracker) as total`)
                .then((q: QueryResult)=>{
                    valWithTrading=q.rows[0].total;
                });
        });
    });
}).then(() => {
    console.log("Value if I chose not to trade: $"+valWithoutTrading.toFixed(2));
    console.log("Original Investment: $"+originalVal.toFixed(2));
    console.log("Current Value: $"+valWithTrading.toFixed(2));
    var diff:number=valWithTrading-valWithoutTrading;
    console.log("Profit made by trading Algo: $"+diff.toFixed(2));
    var diff:number=valWithTrading-originalVal;
    console.log("Total gain/loss: $"+diff.toFixed(2));
    return client.end();
}).catch((err: Error) => {
    console.log(err.stack);
});


/*
api.loadTicker('ETH-USD').then((ticker: Ticker) => {
    var price = ticker.price.toString();
    return client.connect().then(() => {
        return client.query(`SELECT (sum(amount/price))* ${price} as value FROM public.funds_load_tracker;`).then((q: QueryResult) => {
            valWithoutTrading=q.rows[0].value;
        }).then(()=>{
            return client.query(`select((select quote_quantity from configuration)+(select sum(ref_point*quantity) from holdings_value_tracker))as total`)
                .then((q: QueryResult)=>{
                    valWithTrading=q.rows[0].total;
                });
        });
    });
}).then(() => {
    console.log("Value if I chose not to trade: $"+valWithoutTrading.toFixed(2));
    console.log("Current Value: $"+valWithTrading.toFixed(2));
    var diff:number=valWithTrading-valWithoutTrading;
    console.log("Difference: $"+diff.toFixed(2));
    return client.end();
}).catch((err: Error) => {
    console.log(err.stack);
});

/*
api.loadOrder(process.argv[2]).then((order:LiveOrder)=>{
 console.log("Amin"+JSON.stringify(order));
});
*/
/*
api.loadAllOrders().then((order:LiveOrder[])=>{
console.log(JSON.stringify(order));
});
*/

/*
api.handleResponse<string>(api.authCall('GET', '/orders/45b729fc-abc7-45fd-9746-7bb11442b0f3', {}),null).then((res:string)=>{
    console.log(res);
}).catch((err:Error)=>{
    console.log(err.stack);
});
*/

/*
api.loadAllOrders().then((orders:LiveOrder[])=>{
    console.log(JSON.stringify(orders));
})
*/