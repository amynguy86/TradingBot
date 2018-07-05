import { Pool, QueryResult, PoolClient, Query } from 'pg';
import { BigJS } from 'gdax-trading-toolkit/build/src/lib/types';
import { LiveOrder } from 'gdax-trading-toolkit/build/src/lib';
import { TradeFinalizedMessage } from 'gdax-trading-toolkit/build/src/core';
import { BigNumber } from 'gdax-trading-toolkit/node_modules/bignumber.js';

interface HoldingValueTracker {
    ref_point: number;
    quantity?: number;
}
export class OrderStore {
    private readonly pool: Pool;
    private static _instance: OrderStore;

    private constructor() {
        this.pool = new Pool();
    }

    public static getInstance(): OrderStore {
        if (OrderStore._instance == null) {
            OrderStore._instance = new OrderStore();
        }
        return OrderStore._instance;
    }

    public insertNewOrder(refPoint: BigJS, order: LiveOrder): Promise<QueryResult> {
        return this.pool.query('Select new_order($1,$2,$3,$4,$5)', [order.id, order.side, order.size.toNumber(), refPoint.toNumber(), order.price.toNumber()]);
    }

    public markOrderDone(order: TradeFinalizedMessage): Promise<QueryResult> {
        return this.pool.connect().then((client: PoolClient) => {
            return client.query('Select done_order($1,$2)', [order.orderId, Number(order.remainingSize)]).then((q: QueryResult) => {
                client.release();
                return Promise.resolve(q);
            }).catch((err: Error) => {
                return Promise.reject(err);
            });
        });
    }

    public addQuantity(price: string, quantity: string): Promise<QueryResult> {
        return this.pool.query('Select add_quantity($1,$2)', [price, quantity]);
    }

    private subtractQuantity(refPoint: BigJS, quantity: BigJS): Promise<QueryResult> {
        return this.pool.query('Select sub_quantity($1,$2)', [refPoint.toNumber(), Number(quantity)]);
    }

    public orderForQuantity(totalQuantity: BigJS, action: (quantity: BigJS) => boolean) {

    }

    private getAllRefPoints(maxRefPoint: BigJS): Promise<QueryResult> {
        return this.pool.query('SELECT ref_point, quantity FROM public.holdings_value_tracker where ref_point < ($1) and quantity >0 order by ref_point', [maxRefPoint.toString()]);
    }

    public createOrderTransaction(refPoint: BigJS, orderSize: BigJS, totalOrderSize: BigJS, makeOrder: (quantity: BigJS, refPoint: BigJS) => Promise<BigJS>): Promise<BigJS> {
        if (orderSize.lessThanOrEqualTo(0))
            return Promise.resolve(totalOrderSize);

        return this.pool.connect().then((client: PoolClient) => {
            return client.query('BEGIN').then((result: QueryResult) => {
                return client.query('SELECT sub_quantity($1,$2)', [refPoint.toString(), orderSize.toString()]);
            }).then((result: QueryResult) => {
                //make An order here!
                return makeOrder(new BigNumber(result.rows[0].sub_quantity), refPoint);
            }).then((num: BigJS) => {
                return client.query('COMMIT').then(() => {
                    client.release();
                    return Promise.resolve(num.plus(totalOrderSize));
                });
            }).catch((err) => {
                console.log(err.stack);
                return client.query('ROLLBACK').then(() => {
                    client.release();
                    return Promise.resolve(totalOrderSize);
                }).catch((err) => {
                    console.log(err.stack);
                    client.release();
                    console.error('Error rolling back client', err.stack);
                    return Promise.resolve(totalOrderSize);
                })
            });
        }).catch((err) => {
            console.error('Error getting Client', err.stack);
            return Promise.resolve(totalOrderSize); //I want to continue trying
        });
    }

    /*
      Order Size is not guarenteed, it depends on the funds avaliable at the time when the holdings_value_tracker table was queried  AND what is avaliable when each row
      was locked for an update, REturns OrderSize made as Promise.
    
      TODO(Improvement): Do recursve Chaining, because getAllRefPoint may return incorrect values for the data it contains(If parallel Bots are Started)
      CON: Stack Overflow!!
     */
    public sellOrder(orderSize: BigJS, maxRefPoint: BigJS, makeOrder: (quantity: BigJS, refPoint: BigJS) => Promise<BigJS>): Promise<BigJS> {
        return this.getAllRefPoints(maxRefPoint).then((q: QueryResult) => {
            var promiseToReturn: Promise<BigJS> = Promise.resolve(new BigNumber(0));
            var remainingSize: BigJS = new BigNumber(orderSize);
            for (let tmp of q.rows) {
                let value: HoldingValueTracker = {
                    ref_point: tmp.ref_point,
                    quantity: tmp.quantity
                }

                let valueToOrder: BigJS;

                if (remainingSize.minus(value.quantity).greaterThanOrEqualTo(0))
                    valueToOrder = new BigNumber(value.quantity);
                else
                    valueToOrder = remainingSize;

                if (valueToOrder.lessThanOrEqualTo(0)) {
                    break;
                }
                promiseToReturn = promiseToReturn.then((currentOrderSize: BigJS) => {
                    return this.createOrderTransaction(new BigNumber(value.ref_point.toString()), new BigNumber(valueToOrder), currentOrderSize, makeOrder);
                });

                remainingSize = remainingSize.minus(valueToOrder);
            };
            return promiseToReturn;
        }).catch((err: Error) => {
            return Promise.reject(err);
        });
    }

    public buyOrder(quoteQuantity: BigJS, makeOrder: (quantity: BigJS) => Promise<Number>): Promise<void> {
        if (quoteQuantity.lessThanOrEqualTo(0))
            return Promise.reject(new Error("man give me greater than zero"));

        return this.pool.connect().then((client: PoolClient) => {
            return client.query('BEGIN').then((result: QueryResult) => {
                return client.query('SELECT sub_quote_quantity($1)', [quoteQuantity.toFixed(2)]);
            }).then((result: QueryResult) => {
                //make An order here!
                return makeOrder(new BigNumber(result.rows[0].sub_quote_quantity)).then((x: Number) => {
                    if (x > 0) {
                        return client.query('update configuration set quote_quantity=quote_quantity+($1) where id=1', [x.toFixed(2)]).then(() => {
                            return Promise.resolve();
                        }).catch((err: Error) => {
                            console.error("Error:" + err.stack);
                            return Promise.resolve();
                        });
                    }
                    else 
                        return Promise.resolve();
                });
            }).then(() => {
                return client.query('COMMIT').then(() => {
                    client.release();
                    console.log("COMMITTTED");
                    return Promise.resolve();
                });
            }).catch((err) => {
                console.log(err.stack);
                return client.query('ROLLBACK').then(() => {
                    client.release();
                    return Promise.resolve();
                }).catch((err) => {
                    client.release();
                    return Promise.reject(err);
                })
            });
        }).catch((err: Error) => {
            console.error('Error', err.message);
        });
    }

    public printHoldings() {
        this.pool.query('select c.quote_quantity,sum(h.quantity) base_quantity from holdings_value_tracker h,configuration c group by c.quote_quantity').then(
            (result: QueryResult) => {
                console.log("Current Holdings: " + JSON.stringify(result.rows[0]));
            });
    }
}

/*
BigNumber.config({ ERRORS: true });
OrderStore.getInstance().sellOrder(new BigNumber(0.14), new BigNumber(900), (quant: BigJS, refPoint: BigJS) => {
    console.log("Making Order:" + quant + "Ref:" + refPoint)
    return Promise.resolve(quant).then(() => {
        var order = {
            productId: 'eth',
            id: '950aa4fa-738b-11e8-adc0-fa7ae01bbebc',
            side: "sell",
            size: new BigNumber('0.01'),
            price: new BigNumber(700),
            status: 'almost',
            extra: ''
        };
        console.log(":HERE,REF:" + refPoint);
        return OrderStore.getInstance().insertNewOrder(refPoint, order as LiveOrder).then(() => {
            // return test(refPoint).then(()=>{
            console.log("PK");
            return Promise.resolve(new BigNumber(0.01));
        });
    });
}).then((x) => {
    console.log(`TOTAL ORDER:${x}`);
});

function test(param: BigJS): Promise<BigJS> {
    var x: BigJS = param;
    console.log(x.toNumber());
    return Promise.resolve(x);
}

var order = {
    productId: 'eth',
    id: '950aa4fa-738b-11e8-adc0-fa7ae01bbebc',
    side: "sell",
    size: new BigNumber('0.01'),
    price: new BigNumber(700),
    status: 'almost',
    extra: ''
};

console.log(":HERE");
OrderStore.getInstance().insertNewOrder(new BigNumber(700),order as LiveOrder).then(()=>{
    console.log("okl");
})
*/
/*
OrderStore.getInstance().buyOrder(new BigNumber(0.01),(quant:BigJS): Promise<void>=>{
    console.log("Buying, Quant:"+quant);
    return Promise.reject(new Error("Some Issue"));
});
*/