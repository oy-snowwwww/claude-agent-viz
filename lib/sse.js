// SSE (Server-Sent Events) 브로드캐스트 -- state.sseClients를 통해 전파

var state = require('./state');

function broadcastEvent(eventData) {
  var msg = 'data: ' + JSON.stringify(eventData) + '\n\n';
  state.sseClients = state.sseClients.filter(function(client) {
    try { client.write(msg); return true; }
    catch(e) { return false; }
  });
}

module.exports = {
  broadcastEvent: broadcastEvent,
};
