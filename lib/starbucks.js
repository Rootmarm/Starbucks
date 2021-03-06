'use strict';

const _ = require('lodash');
const Axios = require('axios');
const Bluebird = require('bluebird');
const QueryString = require('querystring');
const Moment = require('moment');

const signature = require('./signature');

class Client {

    constructor(client_id, client_secret, access_token) {
        this.client_id = client_id;
        this.client_secret = client_secret;

        this.access_token = access_token;

        this._httpClient = Axios.create({
            baseURL: 'https://openapi.starbucks.com/v1/'
        });
    }

    authenticate(username, password) {
        const sig = signature(this.client_id, this.client_secret, Moment().unix());

        // DEBUG
        /*console.log("Timestamp: " + this._now);
        console.log("Signature: " + sig);*/

        const url = 'oauth/token?' + QueryString.stringify({
            sig: sig,
            platform: 'Android'
        });

        const params =  QueryString.stringify({
            grant_type: "password",
            client_id: this.client_id,
            client_secret: this.client_secret,
            username: username,
            password: password,
            timestamp: this._now
        }) + "\r\n";

        return this._httpClient({
            method: 'POST',
            headers: {
                'X-Api-Key': this.client_id,
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            url: url,
            data: params
        }).then(response => {
            const access_token_key = 'access_token';
            const result = _.pick(response.data, access_token_key)
            this.access_token = _.get(result, access_token_key, this.access_token);
            return result;
        });
    }

    _authenticatedRequest(params) {
        const options = _.merge({}, params, {
            headers: {
                Authorization: `Bearer ${this.access_token}`,
                Accept: 'application/json; charset=UTF-8',
                'User-Agent' :'Starbucks Android 4.3.9',
            }
        });
        return this._httpClient(options);
    }

    getNearbyStores(latitude, longitude, radius, limit){
        const url = 'stores/nearby?' + QueryString.stringify({
            limit: limit,
            latlng: latitude + "," + longitude,
            radius: radius,
            offset: 0,
            ignore: 'regularHours,timeZoneInfo,extendedHours,brandName,ownershipTypeCode,operatingStatus,regulations,serviceTime,xopState,currency,address.countrySubdivisionCode,hoursNext7Days.holidayCode',
            access_token: this.access_token
        });
        return this._httpClient({
            method: 'GET',
            url: url
        }).then(response => {
            let stores = _.get(response, 'data.stores');
            stores = _.map(stores, o => _.pick(_.get(o, 'store', {}), ['id', 'name', 'storeNumber', 'phoneNumber', 'coordinates', 'hoursNext7Days', 'address']));
            return stores;
        });
    }

    getProfile(){
        const url = 'me/profile?access_token=' + this.access_token + '&ignore=tippingPreferences%2Cdevices%2CfavoriteStores';

        return this._httpClient({
            method: 'GET',
            url: url
        }).then(response => {
            let starbucksCards = _.get(response, 'data.starbucksCards');
            starbucksCards = _.map(starbucksCards, o => _.pick(o, ['cardId', 'cardNumber', 'nickname', 'class', 'type', 'balanceCurrencyCode', 'submarketCode', 'balance', 'balanceDate', 'primary', 'partner', 'autoReloadProfile', 'digital', 'owner']));
            return starbucksCards;
        });
    }

    getCurrentBalance(cardNumber) {
        const url = 'me/cards/' + cardNumber + '/balance' + QueryString.stringify({
            access_token: this.access_token
        });
        return this._httpClient({
            method: 'GET',
            url: url
        }).then(response => {
            let card = _.get(response, 'data');
            DEBUG
            console.log(card[balance]);
            return card[balance];
        });
    }

    cards() {
        return this._authenticatedRequest({
            method: 'get',
            url: 'me/cards'
        }).then(response => {
            const cards = response.data;
            return _.map(cards, o => _.pick(o, ['name', 'cardId', 'cardNumber', 'nickname', 'balance']));
        });
    }

    last_order() {
        const params = {
            market: 'US',
            locale: 'en-US',
            limit: 1,
            offset: 0
        };
        return this._authenticatedRequest({
            url: 'me/orders',
            method: 'get',
            params: params
        }).then(response => {
            return _.get(response, 'data.orderHistoryItems.0.basket');
        });
    }

    convert_order_to_cart(order) {
        let preparation = _.get(order, 'preparation');
        let items = _.get(order, 'items', []);
        items = _.map(items, it => _.pick(it, ['quantity', 'commerce.sku']));
        if(preparation)
         {
            return {
                cart: {
                    offers: [],
                    items: items
                },
                delivery: {
                    deliveryType: preparation
                }
            }   
        }
        else
        {        
            return {
                cart: {
                    offers: [],
                    items: items
                }      
            };
        }
    }

    price_order(store, cart) {
        const params = cart;
        return this._authenticatedRequest({
            method: 'post',
            url: `me/stores/${store}/priceOrder?` + QueryString.stringify({
                market: 'US',
                locale: 'en-US',
                serviceTime: true
            }),
            data: cart
        }).then(response => {
            const data = _.get(response, 'data');
            return _.pick(data, ['orderToken', 'summary.totalAmount', 'store.storeNumber', 'signature']);
        });
    }

    place_order(details, card_id) {
        const params = {
            signature: details.signature,
            tenders: [{
                amountToCharge: details.summary.totalAmount,
                type: "SVC",
                id: card_id
            }]
        };
        return this._authenticatedRequest({
            method: 'post',
            url: `me/stores/${details.store.storeNumber}/orderToken/${details.orderToken}/submitOrder?` + QueryString.stringify({
                market: 'US',
                locale: 'en-US'
            }),
            data: params
        }).then(response => {
            return _.get(response, 'data');
        });
    }
}

module.exports = Client;