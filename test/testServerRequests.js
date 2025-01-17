const test = require("ava");
const path = require("path");
const http = require("http");
const process = require("process");
const EleventyDevServer = require("../");

function getOptions(options = {}) {
  options.logger = {
    info: function() {},
    error: function() {},
  };
  // Servers don't close fast enough during testing.
  options.portReassignmentRetryCount = 999; 
  return options;
}

async function makeRequestTo(t, server, path) {
  let port = await server.getPort();

  return new Promise(resolve => {
    const options = {
      hostname: 'localhost',
      port,
      path,
      method: 'GET',
    };

    http.get(options, (res) => {
      const { statusCode } = res;
      if(statusCode !== 200) {
        throw new Error("Invalid status code" + statusCode);
      }

      res.setEncoding('utf8');

      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        t.true( true );
        resolve(rawData);
      });
    }).on('error', (e) => {
      console.error(`Got error: ${e.message}`);
    });
  })
}

async function fetchHeadersForRequest(t, server, path) {
  let port = await server.getPort();

  return new Promise(resolve => {
    const options = {
      hostname: 'localhost',
      port,
      path,
      method: 'GET',
    };

    http.get(options, (res) => {
      const { statusCode } = res;
      if(statusCode !== 200) {
        throw new Error("Invalid status code" + statusCode);
      }

      let headers = res.headers;
      resolve(headers);

    }).on('error', (e) => {
      console.error(`Got error: ${e.message}`);
    });
  })
}

test("Standard request", async t => {
  let server = new EleventyDevServer("test-server", "./test/stubs/", getOptions());
  server.serve(8100);

  let data = await makeRequestTo(t, server, "/sample");
  t.true(data.includes("<script "));
  t.true(data.startsWith("SAMPLE"));

  server.close();
});

test("One sync middleware", async t => {
  let server = new EleventyDevServer("test-server", "./test/stubs/", getOptions({
    middleware: [
      function(req, res, next) {
        return next();
      }
    ],
  }));

  server.serve(8100);

  let data = await makeRequestTo(t, server, "/sample");
  t.true(data.includes("<script "));
  t.true(data.startsWith("SAMPLE"));

  server.close();
});

test("Two sync middleware", async t => {
  let server = new EleventyDevServer("test-server", "./test/stubs/", getOptions({
    middleware: [
      function(req, res, next) {
        return next();
      },
      function(req, res, next) {
        return next();
      }
    ],
  }));
  server.serve(8100);

  let data = await makeRequestTo(t, server, "/sample");
  t.true(data.includes("<script "));
  t.true(data.startsWith("SAMPLE"));

  server.close();
});

test("One async middleware", async t => {
  let server = new EleventyDevServer("test-server", "./test/stubs/", getOptions({
    middleware: [
      async function(req, res, next) {
        return next();
      }
    ],
  }));
  server.serve(8100);

  let data = await makeRequestTo(t, server, "/sample");
  t.true(data.includes("<script "));
  t.true(data.startsWith("SAMPLE"));

  server.close();
});

test("Two async middleware", async t => {
  let server = new EleventyDevServer("test-server", "./test/stubs/", getOptions({
    middleware: [
      async function(req, res, next) {
        return next();
      },
      async function(req, res, next) {
        return next();
      }
    ],
  }));
  server.serve(8100);

  let data = await makeRequestTo(t, server, "/sample");
  t.true(data.includes("<script "));
  t.true(data.startsWith("SAMPLE"));

  server.close();
});

test("Async middleware that writes", async t => {
  let server = new EleventyDevServer("test-server", "./test/stubs/", getOptions({
    // enabled: false,
    middleware: [
      async function(req, res, next) {
        let data = await new Promise((resolve) => {
          setTimeout(() => {
            resolve("Injected")
          }, 10);
        });

        res.writeHead(200, {
          "Content-Type": "text/html",
        });
        res.write("Injected");
        res.end();
      },
    ],
  }));
  server.serve(8100);

  let data = await makeRequestTo(t, server, "/sample");
  t.true(data.includes("<script "));
  t.true(data.startsWith("Injected"));

  server.close();
});

test("Second async middleware that writes", async t => {
  let server = new EleventyDevServer("test-server", "./test/stubs/", getOptions({
    // enabled: false,
    middleware: [
      async function(req, res, next) {
        await new Promise((resolve) => {
          setTimeout(() => {
            resolve()
          }, 10);
        });

        next()
      },
      async function(req, res, next) {
        let data = await new Promise((resolve) => {
          setTimeout(() => {
            resolve("Injected")
          }, 10);
        });

        res.writeHead(200, {
          "Content-Type": "text/html",
        });
        res.write(data);
        res.end();
      },
    ],
  }));
  server.serve(8100);

  let data = await makeRequestTo(t, server, "/sample");
  t.true(data.includes("<script "));
  t.true(data.startsWith("Injected"));

  server.close();
});


test("Second middleware that consumes first middleware response body, issue #29", async t => {
  let server = new EleventyDevServer("test-server", "./test/stubs/", getOptions({
    // enabled: false,
    middleware: [
      async function(req, res, next) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.write("First ");

        next()
      },
      async function(req, res, next) {
        res.body += "Second ";
        // No need for `next()` when you do `end()`
        res.end();
      },
    ],
  }));
  server.serve(8100);

  let data = await makeRequestTo(t, server, "/sample");
  t.true(data.includes("<script "));
  t.true(data.startsWith("First Second "));

  server.close();
});

test("Two middlewares, end() in the first, skip the second", async t => {
  let server = new EleventyDevServer("test-server", "./test/stubs/", getOptions({
    // enabled: false,
    middleware: [
      async function(req, res, next) {
        res.writeHead(200, {"Content-Type": "text/html"});
        res.write("First ");
        res.end();
      },
      async function(req, res, next) {
        res.body += "Second ";

        next();
      },
    ],
  }));
  server.serve(8100);

  let data = await makeRequestTo(t, server, "/sample");
  t.true(data.includes("<script "));
  t.true(data.startsWith("First "));
  t.true(!data.startsWith("First Second "));

  server.close();
});

test("Fun unicode paths", async t => {
  let server = new EleventyDevServer("test-server", "./test/stubs/", getOptions());
  server.serve(8100);

  let data = await makeRequestTo(t, server, encodeURI(`/zach’s.html`));
  t.true(data.includes("<script "));
  t.true(data.startsWith("This is a test"));

  server.close();
});

test("Content-Type header via middleware", async t => {
  let server = new EleventyDevServer("test-server", "./test/stubs/", getOptions({
    middleware: [
      function (req, res, next) {
        if (/.*\.php$/.test(req.url)) {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }

        next();
      }
    ]
  }));
  server.serve(8100);

  let data = await fetchHeadersForRequest(t, server, encodeURI(`/index.php`));
  t.true(data['content-type'] === 'text/html; charset=utf-8');

  server.close();
});

// These tests need to be run serially because they set+read environment
// variables.
test.serial("Base URL is injected into environment", async t => {
  let server = new EleventyDevServer(
    "test-server",
    "./test/stubs/",
    getOptions({injectBaseUrlIntoEnvironment: true})
    );
  // Use a port < 8100 so we don't get caught by increasing port numbers.
  server.serve(8075);
  await makeRequestTo(t, server, "/");

  t.true("ELEVENTY_SERVER_BASEURL" in process.env);
  t.is(process.env.ELEVENTY_SERVER_BASEURL, "http://localhost:8075/");

  delete process.env.ELEVENTY_SERVER_BASEURL;
  server.close();
});

test.serial("Base URL is not injected into environment by default", async t => {
  let server = new EleventyDevServer(
    "test-server",
    "./test/stubs/",
    getOptions()
  );
  // If we set this to 8100 the first non-serial (concurrent) test that tries
  // to serve on 8100 gets an ECONNRESET error.
  server.serve(8200);
  await makeRequestTo(t, server, "/");
  
  t.false("ELEVENTY_SERVER_BASEURL" in process.env);
  server.close();
});
