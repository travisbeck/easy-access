#! /usr/bin/env node

'use strict';
var http        = require('http');
var url         = require('url');
var querystring = require('querystring');
var open        = require('open');
var request     = require('request');
var fs          = require('fs');
var prompt      = require('prompt');
var lodash      = require('lodash');
var providers   = require('./providers');

// TODO: swagger integration
// TODO: make it into a command-line utility (using nomnom or minimist)
// TODO: incremental scope authorization
// TODO: write tests
// TODO: better error handling

var EasyAccess = function(provider, options) {
  if (provider && providers[provider]) options = lodash.merge(providers[provider], options);
  if (!options) options = {};
  this.host          = options.host || 'accounts.shutterstock.com';
  this.port          = options.port || 3003;
  this.client_id     = options.client_id;
  this.client_secret = options.client_secret;
  this.client_grant  = options.client_grant || false;
  this.config_file   = options.config_file || '.easy-access-' + this.host + '.json';
  this.debug         = options.debug || false;
  this.scope         = options.scope;
  this.authorize_endpoint = options.authorize_endpoint || '/oauth/authorize';
  this.token_endpoint = options.token_endpoint || '/oauth/access_token';
  return this;
};

EasyAccess.prototype.load = function(callback) {
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

EasyAccess.prototype.get_access_token = function(callback) {
  var self = this;
  self.load(function(file_data) {
    if (self.client_grant) {
      self.request_client_token(callback);
    } else if (file_data.access_token && file_data.expiration && file_data.expiration > Date.now() + 60 * 5 * 1000) {
      callback(file_data);
    } else if (file_data.access_token && file_data.expiration === null) {
      // take an existing expiration with a null value to mean 'no expiration'
      callback(file_data);
    } else if (file_data.refresh_token) {
      console.error('Using refresh token to acquire new access token...');
      self.refresh_access_token(file_data.refresh_token, callback);
    } else {
      self.authorize_manually(callback);
    }
  });
}

EasyAccess.prototype.authorize_manually = function(callback) {
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
    self.request_authorization(callback);
  });
}

EasyAccess.prototype.request_authorization = function(callback) {
  var self = this;
  var authorize_url = url.format({
    protocol: 'https',
    host: self.host,
    pathname: self.authorize_endpoint,
    query: {
      client_id:     self.client_id,
      redirect_uri:  'http://localhost:' + self.port + '/',
      scope:         self.scope,
      response_type: 'code',
    }
  });

  EasyAccess.single_use_web_server(self.port, authorize_url, function(params) {
    if (params.pathname == '/' && params.query.code) {
      self.request_access_token({
        client_id: self.client_id,
        client_secret: self.client_secret,
        grant_type: 'authorization_code',
        code: params.query.code,
        redirect_uri:  'http://localhost:' + self.port + '/',
      }, function(err, token_data) {
        callback(token_data);
      });
    } else {
      console.error('Unknown request:');
      console.error(params);
      callback();
    }
  });
}

// spin up a disposable web server for redirecting a browser back into
EasyAccess.single_use_web_server = function(port, browser_url, callback) {
  var sockets = [];
  var server = http.createServer(function (req, res) {
    var params = url.parse(req.url, true);
    callback(params);
    res.on('finish', function() {
      // close opened sockets and the server when the request is done
      sockets.forEach(function(socket) { socket.destroy() });
      server.close(function() { console.error('Server stopped') });
    });
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end("<html><head><script>setTimeout(function(){window.open('','_self','');window.close()},10)</script></head><body>You may close this window.</body></html>");
  }).listen(port);
  server.on('connection', function(socket) { sockets.push(socket) });
  console.error('Server running at http://localhost:' + port + '/');

  open(browser_url);
}

EasyAccess.prototype.request_client_token = function(callback) {
  var self = this;
  console.error('Getting access token for client');
  self.request_access_token({
    client_id: self.client_id,
    client_secret: self.client_secret,
    grant_type: 'client_credentials',
  }, function(err, token_data) {
    callback(token_data);
  });
}

EasyAccess.prototype.refresh_access_token = function(refresh_token, callback) {
  var self = this;
  self.request_access_token({
    client_id: self.client_id,
    client_secret: self.client_secret,
    grant_type: 'refresh_token',
    refresh_token: refresh_token,
  }, function(err, token_data) {
    if (token_data) {
      callback(token_data);
    } else {
      console.error('Refresh token failed: ' + err);
      self.authorize_manually(callback);
    }
  });
}

EasyAccess.prototype.request_access_token = function(form_data, callback) {
  var self = this;
  request.post('https://' + self.host + self.token_endpoint, {
      form: form_data,
      headers: {
        Accept: 'application/json,application/x-www-form-urlencoded'
      }
    }, function(error, response, body) {
    if (error) {
      console.error(error);
      return callback(error);
    } else if (response.statusCode == 200) {
      var token_data = {};
      if (response.headers['content-type'].match('^application/json')) {
        token_data = JSON.parse(body);
      } else if (response.headers['content-type'].match('^application/x-www-form-urlencoded')) {
        token_data = querystring.parse(body);
      }
      if (token_data.expires_in) {
        token_data.expiration = Date.now() + token_data.expires_in * 1000;
      } else {
        token_data.expiration = null;
      }
      token_data.client_id = form_data.client_id;
      token_data.client_secret = form_data.client_secret;
      delete token_data.expires_in;

      fs.writeFile(self.config_file, JSON.stringify(token_data, undefined, 2), function(err) {
        console.error('Token data written to: ' + self.config_file);
        callback(null, token_data);
      });
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

module.exports = EasyAccess;

if (require.main === module) {
  var provider = process.argv[2];
  var easy_access = new EasyAccess(provider, {
    host:          process.env.HOST,
    port:          process.env.PORT,
    client_id:     process.env.CLIENT,
    client_secret: process.env.SECRET,
    client_grant:  process.env.CLIENT_GRANT,
    config_file:   process.env.AUTH_FILE,
    debug:         process.env.DEBUG,
    scope:         process.env.SCOPE,
    authorize_endpoint: process.env.AUTHORIZE_ENDPOINT,
    token_endpoint: process.env.TOKEN_ENDPOINT,
  });
  easy_access.get_access_token(function(token_data) {
    if (token_data && token_data.access_token) console.log(token_data.access_token);
  });
}
