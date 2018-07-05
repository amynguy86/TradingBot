import { LiveOrder } from 'gdax-trading-toolkit/build/src/lib';
import { GDAXExchangeAPI } from "../../gdax-tt/build/src/exchanges/index";
import * as GTT from 'gdax-trading-toolkit';
import { DefaultAPI } from "../../gdax-tt/build/src/factories/gdaxFactories";

const logger = GTT.utils.ConsoleLoggerFactory({ level: 'debug' });
var api:GDAXExchangeAPI= DefaultAPI(logger);


api.loadOrder(process.argv[2]).then((order:LiveOrder)=>{
 console.log(JSON.stringify(order));
})

/*
api.loadAllOrders().then((orders:LiveOrder[])=>{
    console.log(JSON.stringify(orders));
})
*/