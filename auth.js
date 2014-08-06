'use strict';
var http     = require('http');
var url      = require('url');
var open     = require('open');
var request  = require('request');
var fs       = require('fs');
var prompt   = require('prompt');
var util     = require('util');

// TODO: better scopes handling
// TODO: swagger integration

var Auth = function(options) {
  if (!options) options = {};
  this.host          = options.host || 'accounts.shutterstock.com';
  this.port          = options.port || 3003;
  this.client_id     = options.client_id;
  this.client_secret = options.client_secret;
  this.config_file   = options.config_file || '.' + (options.host ? options.host : 'shutterstock') + '.json';
  this.debug         = options.debug || false;
  return this;
};

Auth.prototype.load = function(callback) {
  var self = this;
  fs.readFile(self.config_file, function(err, data) {
    if (data) {
      var config = JSON.parse(data.toString());
      self.client_id = config.client_id;
      self.client_secret = config.client_secret;
      callback(config);
    } else {
      callback({});
    }
  });
}

Auth.prototype.get_access_token = function(callback) {
  var self = this;
  self.load(function(file_data) {
    if (file_data.access_token && file_data.expiration && file_data.expiration > Date.now() + 60 * 5 * 1000) {
      callback(file_data);
    } else if (file_data.refresh_token) {
      console.error('Using refresh token to acquire new access token...');
      self.refresh_access_token(file_data.refresh_token, callback);
    } else {
      self.authorize_manually(callback);
    }
  });
}

Auth.prototype.authorize_manually = function(callback) {
  var self = this;
  if (!Boolean(process.stdin.isTTY) || !Boolean(process.stdout.isTTY)) {
    console.error("Not connected to an interactive terminal, can't request manual authorization through the browser. Unable to continue.");
    return callback();
  }

  prompt.override = self
  prompt.message = '';
  prompt.delimiter = '';
  prompt.start();
  prompt.get([{ name: 'client_id', description: 'Enter your client id:' }, { name: 'client_secret', description: 'Enter your client secret:' }], function(err, result) {
    self.client_id = result.client_id;
    self.client_secret = result.client_secret;
    console.error('Opening browser window to login manually...');
    self.request_authorization(null, callback);
  });
}

Auth.prototype.request_authorization = function(auth_url, callback) {
  var self = this;
  var sockets = [];

  var server = http.createServer(function (req, res) {
    var params = url.parse(req.url, true);
    if (params.pathname == '/' && params.query.code) {
      self.request_access_token({
        client_id: self.client_id,
        client_secret: self.client_secret,
        grant_type: 'authorization_code',
        code: params.query.code,
      }, function(err, token_data) {
        if (token_data) {
          fs.writeFile(self.config_file, JSON.stringify(token_data, undefined, 2), function(err) {
            console.error('Token data written to: ' + self.config_file);
            callback(token_data);
          });
        } else {
          callback();
        }
      });
    } else if (params.pathname == '/zoom') {
      callback();
    }
    res.on('finish', function() {
      // close opened sockets and the server
      for (var i = 0; i < sockets.length; i++) {
        sockets[i].destroy();
      }
      server.close(function() { console.error('Server stopped') });
    });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end("<html><head><script>setTimeout(function(){window.open('','_self','');window.close()},10)</script></head><body>You may close this window.</body></html>");
  }).listen(self.port);
  server.on('connection', function(socket) { sockets.push(socket) });

  console.error('Server running at http://localhost:' + self.port + '/');

  var authorize_url = auth_url || url.format({
    protocol: 'https',
    host: self.host,
    pathname: '/oauth/authorize',
    query: {
      client_id:    self.client_id,
      redirect_uri: 'http://localhost:' + self.port + '/',
      scope:        'user.view user.email user.address user.edit organization.view organization.address collections.view collections.edit licenses.view licenses.create'
    }
  });
  open(authorize_url);
}

Auth.prototype.refresh_access_token = function(refresh_token, callback) {
  var self = this;
  self.request_access_token({
    client_id: self.client_id,
    client_secret: self.client_secret,
    grant_type: 'refresh_token',
    refresh_token: refresh_token,
  }, function(err, token_data) {
    if (token_data) {
      fs.writeFile(self.config_file, JSON.stringify(token_data, undefined, 2), function(err) {
        console.error('Token data written to: ' + self.config_file);
        callback(token_data);
      });
    } else {
      console.error('Refresh token failed: ' + err);
      self.authorize_manually(callback);
    }
  });
}

Auth.prototype.request_access_token = function(form_data, callback) {
  var self = this;
  request.post('https://' + self.host + '/oauth/access_token', { form: form_data }, function(error, response, body) {
    if (error) {
      console.error(error);
      return callback(error);
    } else if (response.statusCode == 200 && response.headers['content-type'].match('^application/json')) {
      var token_data = JSON.parse(body);
      token_data.expiration = Date.now() + token_data.expires_in * 1000;
      token_data.client_id = form_data.client_id;
      token_data.client_secret = form_data.client_secret;
      delete token_data.expires_in;
      return callback(null, token_data);
    } else {
      if (self.debug) {
        console.error('Unexpected response getting access token');
        console.error('REQUEST:\n\n' + response.request.method + ' ' + response.request.uri.href);
        Object.keys(response.request.headers).forEach(function(key) { console.error(key + ': ' + response.request.headers[key]) });
        console.error("\n" + response.request.body + "\n");
        console.error('RESPONSE:\n\nHTTP/' + response.httpVersion + ' ' + response.statusCode);
        Object.keys(response.headers).forEach(function(key) { console.error(key + ': ' + response.headers[key]) });
        console.error("\n" + body + "\n");
      }
      return callback(body);
    }
  });
}

module.exports = Auth;

if (require.main === module) {
  var auth = new Auth({
    host:          process.env.HOST,
    port:          process.env.PORT,
    client_id:     process.env.CLIENT,
    client_secret: process.env.SECRET,
    config_file:   process.env.AUTH_FILE,
    debug:         process.env.DEBUG,
  });
  auth.get_access_token(function(token_data) {
    if (token_data.access_token) console.log(token_data.access_token);
  });
}
