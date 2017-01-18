/*global require:true, module:true, options:true */
// Declare the module
module.exports = function (grunt) {
	'use strict';

	grunt.registerMultiTask('clientlibs', 'Dynamically generate AEM client libraries', function () {
		var MODULE_NAME = '[clientlibs]',
			clientLibXML = '<?xml version="1.0" encoding="UTF-8"?>\r\n<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0"\r\njcr:primaryType="cq:ClientLibraryFolder"\r\njcr:title="$$NAME$$"\r\ncategories="[$$NAME$$]" />',
			clientLibs = {},
			compressorConfig = {
				sequences: true,
				properties: false,
				dead_code: true,
				drop_debugger: true,
				unsafe: false,
				conditionals: true,
				comparisons: true,
				evaluate: true,
				booleans: true,
				loops: true,
				unused: false,
				hoist_funs: true,
				hoist_vars: false,
				if_return: true,
				join_vars: true,
				cascade: true,
				side_effects: true,
				warnings: true,
				global_defs: {}
			},
			config = {
				clientLibPath: './clientlibs/',
				minSuffix: '-min',
				root: './',
				verbose: false
			},
			fs = require('fs'),
			recursive = require('recursive-readdir'),
			uglifycss = require('uglifycss'),
			uglifyjs = require('uglifyjs');

		/**
		 * @function _log
		 * @description Determines whether or not it is appropriate to log messages and formats them
		 * @param {string} msg The message to log
		 * @param {object} obj An optional object to log
		 * @returns {void}
		 */
		function _log(msg, obj) {
			if (config.verbose === true) {
				if (typeof obj !== 'undefined') {
					console.log(MODULE_NAME + ' ' + msg, obj);
				} else {
					console.log(MODULE_NAME + ' ' + msg);
				}
			}
		}

		/**
		 * @function addFile
		 * @description Adds a file to the appropriate client library object(s)
		 * @param {object} file The file to add
		 * @param {string} fileContent The retrieved file content
		 * @returns {void}
		 */
		function addFile(file, fileContent) {
			// Fail gracefully
			_log('Is the file content a valid string?', typeof fileContent === 'string');
			if (typeof fileContent !== 'string') {
				return;
			}

			// Perform pattern matching
			var clientLib = {
					'depends': [],
					'fileContent': fileContent,
					'fileName': file
				},
				clientLibPattern = /(\@clientlib )([a-zA-Z0-9\.\-\_]{0,})/g,
				clientLibMatches = fileContent.match(clientLibPattern),
				clientLibIsArray = Array.isArray(clientLibMatches),
				dependPattern = /(\@depend(s|) )([a-zA-Z0-9\/\.\-\_]{0,})/g,
				dependMatches = fileContent.match(dependPattern),
				dependIsArray = Array.isArray(dependMatches);

			// Populate the object
			_log('Did we get an array of dependencies?', dependIsArray);
			if (dependIsArray === true) {
				dependMatches.forEach(function (matchStr) {
					var dependName = matchStr.replace('@depends', '').replace('@depend', '').trim();
					_log('Adding a dependency:', dependName);
					clientLib.depends.push(dependName);
				});
			}

			// Add the object to the appropriate client libraries
			_log('Did we get an array of client libraries?', clientLibIsArray);
			if (clientLibIsArray === true) {
				clientLibMatches.forEach(function (matchStr) {
					var clientLibName = matchStr.replace('@clientlib', '').trim(),
						clientLibRef = clientLibs[clientLibName];

					_log('Creating an object for a client library:', clientLibName);
					if (clientLibName !== '') {
						if (typeof clientLibRef !== 'object' || clientLibRef === null) {
							_log('Creating a client library:', clientLibName);
							clientLibs[clientLibName] = {
								'css': [],
								'js': []
							};
							clientLibRef = clientLibs[clientLibName];
						}
						if (file.indexOf('.css') > -1) {
							clientLibRef.css.push(clientLib);
							_log('Added a CSS file.');
						} else if (file.indexOf('.js') > -1) {
							clientLibRef.js.push(clientLib);
							_log('Added a JavaScript file.');
						}
					}
				});
			}
		}

		/**
		 * @function compressJS
		 * @description Attempts to minify a string representing a JavaScript source
		 * @param {string} source The source to minify
		 * @returns {string} The minified source or an empty string
		 */
		function compressJS(source) {
			var compressor,
				returnValue = '',
				tree;

			// Attempt to minify the source using `uglifyjs`
			_log('Is the JS source a valid string?', typeof source === 'string');
			if (typeof source === 'string') {
				// Attempt minification
				try {
					tree = uglifyjs.parse(source);
					tree.figure_out_scope();
					compressor = uglifyjs.Compressor(compressorConfig);
					tree = tree.transform(compressor);
					returnValue = tree.print_to_string();
				} catch (e) {
					_log(e);
				}
			}

			// Return minified JS if possible
			_log('Minified JavaScript length:', returnValue.length);
			return returnValue;
		}

		/**
		 * @function createClientLibs
		 * @description Attempts to create client library files from an object collection
		 * @returns {void}
		 */
		function createClientLibs () {
			var clientLibNames = Object.keys(clientLibs),
				clientLibCount = clientLibNames.length,
				clientLibPath = config.clientLibPath,
				clientLibName = '',
				clientLibObj = {},
				clientLibCSS = '',
				clientLibJS = '',
				fullClientLibPath = '',
				minClientLibCSS = '',
				minClientLibJS = '',
				minClientLibXML = '',
				j = 0;

			for (var i = 0; i < clientLibCount; i = i + 1) {
				clientLibCSS = '';
				clientLibJS = '';
				clientLibName = (clientLibNames[i] + '').trim();
				fullClientLibPath = clientLibPath + clientLibName;
				fullClientLibXML = clientLibXML.replace(/\$\$NAME\$\$/g, clientLibName);
				minClientLibPath = fullClientLibPath + config.minSuffix;
				minClientLibXML = clientLibXML.replace(/\$\$NAME\$\$/g, clientLibName + config.minSuffix);

				// Filter invalid names
				_log('Attempting to create client library:', clientLibName);
				if (clientLibName === '') {
					continue;
				} else {
					clientLibObj = clientLibs[clientLibName];

					// Do we have a valid client library object
					_log('Is the client library object valid?', isValidObject(clientLibObj));
					if (isValidObject(clientLibObj)) {
						// Set references to child objects
						clientLibCSSObj = clientLibObj.css;
						clientLibJSObj = clientLibObj.js;

						// Ensure we have directories to save to
						if (!fs.existsSync(fullClientLibPath)) {
							fs.mkdirSync(fullClientLibPath);
						}
						if (!fs.existsSync(minClientLibPath)) {
							fs.mkdirSync(minClientLibPath);
						}

						// We need XML
						fs.writeFile(fullClientLibPath + '/.content.xml', fullClientLibXML, function (err) {});
						fs.writeFile(minClientLibPath + '/.content.xml', minClientLibXML, function (err) {});

						// Create the CSS
						_log('Do we have CSS?', (Array.isArray(clientLibCSSObj) && clientLibCSSObj.length > 0));
						if (Array.isArray(clientLibCSSObj) && clientLibCSSObj.length > 0) {
							// Sort the array into dependency order
							clientLibCSSObj = performSort(clientLibCSSObj);

							// Generate and minify the string
							for (var j = 0; j < clientLibCSSObj.length; j = j + 1) {
								clientLibCSS += clientLibCSSObj[j].fileContent + '\r\n';
							}
							minClientLibCSS = uglifycss.processString(clientLibCSS, {});

							// Write the files
							fs.writeFile(fullClientLibPath + '/styles.css', clientLibCSS, function (err) {});
							fs.writeFile(fullClientLibPath + '/css.txt', '#base=.\r\n', function (err) {});
							fs.appendFile(fullClientLibPath + '/css.txt', 'styles.css', function (err) {});
							fs.writeFile(minClientLibPath + '/styles.css', minClientLibCSS, function (err) {});
							fs.writeFile(minClientLibPath + '/css.txt', '#base=.\r\n', function (err) {});
							fs.appendFile(minClientLibPath + '/css.txt', 'styles.css', function (err) {});
						}

						// Create the JS
						_log('Do we have JavaScript?', (Array.isArray(clientLibJSObj) && clientLibJSObj.length > 0));
						if (Array.isArray(clientLibJSObj) && clientLibJSObj.length > 0) {
							// Sort the array into dependency order
							clientLibJSObj = performSort(clientLibJSObj);

							// Generate and minify the string
							for (var j = 0; j < clientLibJSObj.length; j = j + 1) {
								clientLibJS += clientLibJSObj[i].fileContent + '\r\n';
							}
							minClientLibJS = compressJS(clientLibJS);

							// Write the files
							fs.writeFile(fullClientLibPath + '/classes.js', clientLibJS, function (err) {});
							fs.writeFile(fullClientLibPath + '/js.txt', '#base=.\r\n', function (err) {});
							fs.appendFile(fullClientLibPath + '/js.txt', 'classes.js', function (err) {});
							fs.writeFile(minClientLibPath + '/classes.js', minClientLibJS, function (err) {});
							fs.writeFile(minClientLibPath + '/js.txt', '#base=.\r\n', function (err) {});
							fs.appendFile(minClientLibPath + '/js.txt', 'classes.js', function (err) {});
						}
					}
				}
			}
		}

		/**
		 * @function findFiles
		 * @description Finds valid files to be add to client libraries
		 * @returns {void}
		 */
		function findFiles() {
			recursive(config.root, [ignoreFn], function (err, files) {
				if (err) {
					return;
				}
				files.forEach(function (file, index, arr) {
					fs.readFile(config.root + file, 'UTF-8', function (err, data) {
						if (err) {
							return;
						}
						addFile(file, data);
						if (index + 1 === arr.length) {
							createClientLibs();
						}
					});
				});
			});
		}

		/**
		 * @function ignoreFn
		 * @description A helper function to filter files from the results of recursive-readdir
		 * @param {object} file A file located by recursive-readdir
		 * @param {object} stats The information about that file
		 * @returns {boolean} Should the file be rejected?
		 */
		function ignoreFn(file, stats) {
			var returnValue = false;

			// Filter out node modules
			// Filter out non-JS and non-JS files
			if (file.indexOf('node_module') > -1 || file.indexOf(config.clientLibPath.replace('./', '')) > -1) {
				returnValue = true;
			} else if (stats.isDirectory() === false && file.indexOf('.css') === -1 && file.indexOf('.js') === -1) {
				returnValue = true;
			}

			// Filter out JSON files
			if (file.indexOf('.json') > -1) {
				returnValue = true;
			}

			return returnValue;
		}

		/**
		 * @function isValidObject
		 * @description Ensures a variable is a valid object
		 * @param {object} obj The object to verify
		 * @returns {boolean}
		 */
		function isValidObject(obj) {
			return (typeof obj === 'object' && obj !== null);
		}

		/**
		 * @function performSort
		 * @description Sorts an array as many times as it has members to ensure dependency order
		 * @param {object} arr The array to sort
		 * @returns {object} The sorted array
		 */
		function performSort(arr) {
			var returnValue = null,
				arrLength = arr.length,
				i = 0;

			for (i = 0; i < arrLength; i = i + 1) {
				returnValue = arr.sort(sortFn);
			}

			return returnValue;
		}

		/**
		 * @function sortFn
		 * @description A helper function to sort two arrays of file objects
		 * @param {object} fileA The left file, the item to prioritize
		 * @param {object} fileB The right file, the item to compare against
		 * @returns {number} A numerical representation of fileA's position relative to fileB
		 */
		function sortFn(fileA, fileB) {
			var returnValue = 1;

			_log('fileA.fileName:', fileA.fileName);
			_log('fileB.fileName:', fileB.fileName);
			if (fileB.depends.indexOf(fileA.fileName) > -1) {
				returnValue = -1;
			}

			return returnValue;
		}

		/**
		 * @function transferConfigs
		 * @description Transfers configurations between two objects
		 * @param {object} source The object to retrieve values from
		 * @param {object} target The object to transfer values to
		 * @returns {void}
		 */
		function transferConfigs(source, target) {
			var props = Object.keys(source),
				propCount = props.length,
				propName = '',
				sourceVal = null,
				targetVal = null,
				i = 0;

			_log('propCount:', propCount);
			for (i = 0; i < propCount; i = i + 1) {
				propName = props[i];
				sourceVal = source[propName];
				targetVal = target[propName];

				if (typeof sourceVal !== 'undefined' && (typeof targetVal === 'undefined' || typeof targetVal === typeof sourceVal)) {
					target[propName] = sourceVal;
				}
			}
		}

		// Prepare the configurations
		transferConfigs(options, config);
		if (isValidObject(options.minSettings)) {
			transferConfigs(options.minSettings, compressorConfig);
		}

		// Delete all client library files
		recursive(config.clientLibPath, function (err, files) {
			if (err) {
				return;
			}
			if (files.length > 0) {
				files.forEach(function (file, index, arr) {
					try {
						fs.unlinkSync(config.clientLibPath + file);
					} catch (e) {
					}
					if (index + 1 === arr.length) {
						findFiles();
					}
				});
			} else {
				findFiles();
			}
		});
	});
};