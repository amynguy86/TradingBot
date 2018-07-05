import * as GTT from 'gdax-trading-toolkit';
import { GDAXFeedConfig } from "gdax-trading-toolkit/build/src/exchanges";
import { TradingAlgo, AlgoConfig } from './TradingAlgo';

const logger = GTT.utils.ConsoleLoggerFactory({ level: 'debug' });
const auth = {
    key: process.env.GDAX_KEY,
    secret: process.env.GDAX_SECRET,
    passphrase: process.env.GDAX_PASSPHRASE
};

const config: GDAXFeedConfig = {
    auth: auth,
    wsUrl: "wss://ws-feed.pro.coinbase.com",
    //wsUrl: "wss://ws-feed-public.sandbox.gdax.com",
    channels: ['user','ticker', 'heartbeat','level2'],
    apiUrl: "https://api.pro.coinbase.com",
    // apiUrl: "https://api-public.sandbox.gdax.com",
    logger: logger
};

const algoConfig:AlgoConfig={
    product: 'ETH-USD',
    logger: logger,
    feedConfig: config
}

var algo: TradingAlgo = new TradingAlgo(algoConfig);
algo.init().then(()=>{
    logger.log('info',"Algo UP")
}).catch((err:Error)=>{
    logger.log('error',err.message);
    process.exit(1);
});



