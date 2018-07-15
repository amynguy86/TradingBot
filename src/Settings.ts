export class Settings{
    static pdFilter: number=2;//0.01 in $;
    static decimalPlaces:number=4;
    static minSpread:number=0.01; //in $
    static minAmountBase:number=0.01; //eth
    static minAmountQuote:number=0.01; //$
    static failPostOrderRetries:number=2; //This is after the initial order

    static buySettings:any= {
        slopeMin:4.629e-6, //$0.5 per millisecond
        slopeMax:1.15e-5,//$1 per millisecond
        tradeRateMin: 0.30, //in $ rate;
        tradeRateMax: 0.80,
        maxTradeQuantity:150 //in $
    };

    static sellSettings:any= {
        slopeMin:4.629e-6, //$0.5 per millisecond
        slopeMax:1.15e-5,//$1 per millisecond
        tradeRateMin: 0.30, //in $ rate;
        tradeRateMax: 0.80,
        maxTradeQuantity:0.25 //in eth
    };
}