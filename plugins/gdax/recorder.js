var request = require('micro-request')
  , n = require('numbro')
  , z = require('zero-fill')

module.exports = function container (get, set, clear) {
  var x = get('exchanges.gdax')
  var c = get('config')
  var log_trades = get('utils.log_trades')
  var product_id
  var map = get('map')
  var trade_ids = []
  x.products.forEach(function (product) {
    if (product.asset === c.asset && product.currency === c.currency) {
      product_id = product.id
    }
  })
  return function mapper () {
    if (!product_id) return function () {}
    function retry () {
      var timeout = setTimeout(mapper, x.record_interval)
      set('timeouts[]', timeout)
    }
    var rs = get('run_state')
    var uri = x.rest_url + '/products/' + product_id + '/trades' + (rs.gdax_recorder_id ? '?before=' + rs.gdax_recorder_id : '')
    get('logger').info('GET', uri.grey)
    request(uri, {headers: {'User-Agent': USER_AGENT}}, function (err, resp, result) {
      if (err) {
        get('logger').error('gdax recorder err', err, {public: false})
        return retry()
      }
      if (resp.statusCode !== 200 || toString.call(result) !== '[object Array]') {
        console.error(result)
        get('logger').error('gdax non-200 status: ' + resp.statusCode, {feed: 'errors'})
        return retry()
      }
      var trades = result.map(function (trade) {
        rs.gdax_recorder_id = rs.gdax_recorder_id ? Math.max(rs.gdax_recorder_id, trade.trade_id) : trade.trade_id
        var obj = {
          id: x.name + '-' + String(trade.trade_id),
          time: new Date(trade.time).getTime(),
          size: n(trade.size).value(),
          price: n(trade.price).value(),
          side: trade.side,
          exchange: x.name
        }
        map('trade', obj)
        return obj
      }).filter(function (trade) {
        var is_new = trade_ids.indexOf(trade.id) === -1
        if (is_new) {
          trade_ids.push(trade.id)
        }
        return is_new
      })
      if (trades.length) {
        log_trades(x.name + ' recorder', trades)
      }
      else {
        get('logger').info(z(c.max_slug_length, x.name + ' recorder', ' '), 'no new trades.', {feed: 'mapper'})
      }
      retry()
    })
  }
}