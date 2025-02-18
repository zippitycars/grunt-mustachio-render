/**
 * grunt-mustache-render
 * https://github.com/zippitycars/grunt-mustachio-render
 *
 * Copyright (c) 2021 Matt Harding
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function gruntTask(grunt) {
  var mustachio = require("mustachio"),
  path = require('path'),
  Promise = require('es6-promise').Promise,
  request = require('request'),
  yaml = require('js-yaml'),

  DEFAULT_OPTIONS = {
    directory : ".",
    extension : ".mustache",
  };

  /**
   * Public: Create Object for rendering templates
   *
   * options   - The Object options used to configure the renderer
   * directory - The String base directory to look for partials (default: ".")
   * extension - The String extension for partials templates (default: ".mustache")
   */
  function GMR(options) {
    this.options = options(DEFAULT_OPTIONS);
  }

  /**
   * Public: Render a template with the given data to the given destination
   *
   * template - The String path to the template to be rendered
   * data     - The String path to a JSON or YAML file
   *            The data Object
   * dest     - The String path to write the rendered template
   *
   * Returns a Promise to be fulfilled once rendering completes, or rejected if
   * any error occurs while trying to render given the parameters.
   *
   * If the resolved data yields something that isn't an object, "non-object
   * data" will be displayed to the user in yellow as a warning.
   */
  GMR.prototype.render = function render(data, template, dest) {
    return new Promise(function renderPromise(resolve, reject) {
      Promise.all([this._getData(data), this._getBody(template)]).

      then(function gotDataAndBody(results) {
        var dataObj = results[0], body = results[1];

        grunt.log.writeln("Output " + dest + ":");

        var template = mustachio.string(body);

        var baseDir = this.options.directory;
        var extension = this.options.extension;
        var partialResolveFS = new mustachio.partials.FsNoCache(baseDir, [extension]);

        template.render(dataObj, partialResolveFS).string().then(function gotOutput(output) {
          grunt.file.write(dest, output);
          grunt.log.ok(
              (
                  typeof dataObj === 'object' ?
                      (Object.keys(dataObj).length + "-key object").green :
                      "non-object data".yellow
              ) +
              " into " + template.cyan +
              " from " + (typeof data === 'string' ? data : "JavaScript code").cyan
          );

          resolve();
        });
      }.bind(this)).

      catch(function errorFromDataOrBody(exception) {
        grunt.log.writeln(dest + "... " + "ERROR".red);
        reject(exception);
      });
    }.bind(this));
  };

  // Internal: Ensure data is the proper format.
  // The check that was previously here to make sure the user ends up with an
  // object for their data has been moved to render() as there are other ways a
  // non-object could sneak in (e.g. reading odd "JSON" from a file or URL).
  GMR.prototype._getData = function getData(data) {
    return new Promise(function getDataPromise(resolve, reject) {
      if (data === undefined || data === null) {
        reject(new Error("Data must be defined and not null"));
      } else if (typeof data !== 'string' || data === '') {
        resolve(data);
      } else if (/^https?:/.test(data)) {
        resolve(this._getDataFromUrl(data));
      } else {
        resolve(this._getDataFromFile(data));
      }
    }.bind(this));
  };

  // Internal: Read JSON or YAML from a remote URL.
  GMR.prototype._getDataFromUrl = function getDataFromUrl(dataUrl) {
    var promises = this._getDataFromUrl.promiseCache;

    if (promises[dataUrl] === undefined) {
      grunt.log.writeln("Fetching data from " + dataUrl + "...");
      promises[dataUrl] = new Promise(function gdfuCache(resolve, _rej) {
        var reject = function gdfuReject(error) {
            error.url = dataUrl;
            _rej(error);
        };

        request(dataUrl, function gdfuDownloaded(error, response, body) {
          var code = response && response.statusCode;
          var mime = (
            response && response.headers &&
            typeof response.headers['content-type'] === 'string' &&
            response.headers['content-type']
          ) || '';

          if (error) {
            reject(error);
          } else if (code !== 200) {
            reject(new Error("Got status " + code + " downloading data"));
          } else if (typeof body !== 'string' || body === '') {
            reject(new Error("Got empty body while downloading data"));
          } else if (
            dataUrl.substr(-5) === '.json' || dataUrl.substr(-3) === '.js' ||
            mime.indexOf('json') !== -1 || mime.indexOf('javascript') !== -1
          ) {
            resolve(JSON.parse(body));
          } else if (
            dataUrl.substr(-5) === '.yaml' || dataUrl.substr(-4) === '.yml' ||
            mime.indexOf('yaml') !== -1 || mime.indexOf('yml') !== -1
          ) {
            resolve(yaml.load(body));  // uses same parsing method as Grunt
          } else {
            reject(new Error("The data URL does not look like JSON or YAML"));
          }
        });
      });
    }

    return promises[dataUrl];
  };
  GMR.prototype._getDataFromUrl.promiseCache = {};

  // Internal: Read JSON or YAML data from file.
  GMR.prototype._getDataFromFile = function getDataFromFile(dataPath) {
    if (/\.json$/i.test(dataPath)) {
      return grunt.file.readJSON(dataPath);
    } else if (/\.ya?ml$/i.test(dataPath)) {
      return grunt.file.readYAML(dataPath);
    } else if (/\.js$/i.test(dataPath)) {
      var exported = require(path.resolve('.', dataPath));
      if (typeof exported !== 'object') {
        grunt.log.error("Warning: " + dataPath + " exported a non-object");
      } else if (Object.keys(exported).length === 0) {
        grunt.log.error("Warning: " + dataPath + " does not export " +
                        "anything; did you assign to `module.exports`?");
      }
      return exported;
    }

    throw new Error("Data file must be JSON file, YAML file, or JS module. " +
                    "Given: " + dataPath);
  };

  // Internal: Ensure template is in proper format and retrieve its body.
  GMR.prototype._getBody = function getBody(template) {
    return new Promise(function getBodyPromise(resolve, reject) {
      if (typeof template !== 'string' || template === '') {
        reject(new Error("Template path or URL must be given as a string"));
      } else if (/^https?:/.test(template)) {
        resolve(this._getBodyFromUrl(template));
      } else {
        resolve(this._getBodyFromFile(template));
      }
    }.bind(this));
  };

  // Internal: Fetch the template body from the remote URL.
  GMR.prototype._getBodyFromUrl = function getBodyFromUrl(templateUrl) {
    var promises = this._getBodyFromUrl.promiseCache;

    if (promises[templateUrl] === undefined) {
      grunt.log.writeln("Fetching template from " + templateUrl + "...");
      promises[templateUrl] = new Promise(function grffuCache(resolve, _rej) {
        var reject = function grffuReject(error) {
            error.url = templateUrl;
            _rej(error);
        };

        request(templateUrl, function grffuDownloaded(error, response, body) {
          var code = response && response.statusCode;

          if (error) {
            reject(error);
          } else if (code !== 200) {
            reject(new Error("Got status " + code + " downloading template"));
          } else if (typeof body !== 'string' || body === '') {
            reject(new Error("Got empty body while downloading template"));
          } else {
            resolve(body);
          }
        });
      });
    }

    return promises[templateUrl];
  };
  GMR.prototype._getBodyFromUrl.promiseCache = {};

  // Internal: Fetch the template body from the local file.
  GMR.prototype._getBodyFromFile = function getBodyFromFile(file) {
    return grunt.file.read(file);
  };

  grunt.registerMultiTask('mustache_render', 'Render mustache templates',
    function registerTask() {
      var options = this.options();
      var files = this.files.map(function expandFiles(fileData) {
        var dest = fileData.dest;
        if (typeof dest !== 'string' || dest === '') {
          throw new Error("dest must be specified as a string");
        }

        var data = (fileData.data !== undefined) ? fileData.data :
          (options.data !== undefined) ? options.data : undefined;
        var template = fileData.template || options.template;

        if (fileData.src !== undefined) {
          if (!Array.isArray(fileData.src)) {
            throw new Error("Encountered incorrect source definition");
          } else if (fileData.src.length > 1) {
            throw new Error("Encountered multiple inputs for " + dest + ": " +
              fileData.src.join(", ") + " (did you enable the expand flag " +
              "and correctly configure extDot?)");
          } else if (fileData.src.length === 0) {
            return false;
          } else if (data !== undefined) {
            if (template) {
              throw new Error("Use either data OR template with source files");
            } else {
              return {data: data, template: fileData.src[0], dest: dest};
            }
          } else if (template) {
            return {data: fileData.src[0], template: template, dest: dest};
          } else {
            throw new Error("data or template must be used with source files");
          }
        } else if (data !== undefined && template) {
          return fileData;
        } else {
          throw new Error("Please specify data and template for each file");
        }
      }).filter(Boolean);

      if (files.length < 1) {
        grunt.log.error("Nothing to do (are sources correctly specified?)");
        return;
      }

      var renderer = new GMR(this.options);

      var done = (function (gruntDone) {
        return function (success) {
          gruntDone(success);
        };
      }(this.async()));

      Promise.all(files.map(function renderFile(fileData) {
        return renderer.render(fileData.data, fileData.template, fileData.dest);
      })).

      then(function allFulfilled() {
        grunt.log.writeln();
        grunt.log.ok("Files successfully written: " + files.length);

        done();
      }.bind(this)).

      catch(function someRejected(exception) {
        if (exception) {
          grunt.log.error(exception.toString() +
            (exception.url ? " for " + exception.url : ""));

          if (typeof exception.stack === 'string') {
            exception.stack.
              split('\n').
              filter(Boolean).
              slice(1).
              forEach(function logError(line) { grunt.verbose.error(line); });
          }
        }

        done(false);
      });
  });
};
