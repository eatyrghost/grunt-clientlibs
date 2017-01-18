/*global require:true, module:true, options:true */
// Requires
var fs = require('fs'),
	path = require('path'),
	recursive = require('recursive-readdir'),
	uglifycss = require('uglifycss'),
	uglifyjs = require('uglifyjs');

// Declare the module
module.exports = function (grunt) {
	'use strict';

	grunt.registerMultiTask('clientlibs', 'Dynamically generate AEM client libraries', function () {
		var clientLibs = {},
			clientLibXML = '<?xml version="1.0" encoding="UTF-8"?>\r\n<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0"\r\njcr:primaryType="cq:ClientLibraryFolder"\r\njcr:title="$$NAME$$"\r\ncategories="[$$NAME$$]" />',
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
			options = this.options();

		/**
		 * @function addFile
		 * @description Adds a file to the appropriate client library object(s)
		 * @param {object} file The file to add
		 * @returns {void}
		 */
		function addFile(file) {
			try {
				var fileContent = grunt.file.read(file, { encoding: 'utf8' });
				if (typeof fileContent !== 'string' || fileContent.length === 0) {
					return;
				}
			} catch (e) {
				return;
			}
			// Perform pattern matching
			var clientLib = {
					'depends': [],
					'fileContent': fileContent,
					'fileName': file.replace('./', '')
				},
				clientLibPattern = /(\@clientlib )([a-zA-Z0-9\.\-\_]{0,})/g,
				clientLibMatches = fileContent.match(clientLibPattern),
				clientLibIsArray = Array.isArray(clientLibMatches),
				dependPattern = /(\@depend(s|) )([a-zA-Z0-9\/\.\-\_]{0,})/g,
				dependMatches = fileContent.match(dependPattern),
				dependIsArray = Array.isArray(dependMatches);

			// Populate the object
			if (dependIsArray === true) {
				dependMatches.forEach(function (matchStr) {
					var dependName = matchStr.replace('@depends', '').replace('@depend', '').trim();
					clientLib.depends.push(dependName);
				});
			}

			// Add the object to the appropriate client libraries
			if (clientLibIsArray === true) {
				clientLibMatches.forEach(function (matchStr) {
					var clientLibName = matchStr.replace('@clientlib', '').trim(),
						clientLibRef = clientLibs[clientLibName];

					if (clientLibName !== '') {
						if (typeof clientLibRef !== 'object' || clientLibRef === null) {
							clientLibs[clientLibName] = {
								'css': [],
								'js': []
							};
							clientLibRef = clientLibs[clientLibName];
						}
						if (file.indexOf('.css') > -1) {
							clientLibRef.css.push(clientLib);
						} else if (file.indexOf('.js') > -1) {
							clientLibRef.js.push(clientLib);
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
			if (typeof source === 'string') {
				// Attempt minification
				try {
					tree = uglifyjs.parse(source);
					tree.figure_out_scope();
					compressor = uglifyjs.Compressor(compressorConfig);
					tree = tree.transform(compressor);
					returnValue = tree.print_to_string();
				} catch (e) {
				}
			}

			// Return minified JS if possible
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
				clientLibCSSObj = {},
				clientLibJS = '',
				clientLibJSObj = {},
				fullClientLibPath = '',
				fullClientLibXML = '',
				minClientLibCSS = '',
				minClientLibJS = '',
				minClientLibPath = '',
				minClientLibXML = '';

			for (var i = 0; i < clientLibCount; i = i + 1) {
				clientLibCSS = '';
				clientLibJS = '';
				clientLibName = (clientLibNames[i] + '').trim();
				fullClientLibPath = clientLibPath + clientLibName;
				fullClientLibXML = clientLibXML.replace(/\$\$NAME\$\$/g, clientLibName);
				minClientLibPath = fullClientLibPath + config.minSuffix;
				minClientLibXML = clientLibXML.replace(/\$\$NAME\$\$/g, clientLibName + config.minSuffix);

				// Filter invalid names
				if (clientLibName === '') {
					continue;
				} else {
					clientLibObj = clientLibs[clientLibName];

					// Do we have a valid client library object
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
						grunt.file.write(fullClientLibPath + '/.content.xml', fullClientLibXML, { encoding: 'utf8' });
						grunt.file.write(minClientLibPath + '/.content.xml', minClientLibXML, { encoding: 'utf8' });

						// Create the CSS
						if (Array.isArray(clientLibCSSObj) && clientLibCSSObj.length > 0) {
							// Sort the array into dependency order
							clientLibCSSObj = performSort(clientLibCSSObj);

							// Generate and minify the string
							for (var j = 0; j < clientLibCSSObj.length; j = j + 1) {
								clientLibCSS += clientLibCSSObj[j].fileContent + '\r\n';
							}
							minClientLibCSS = uglifycss.processString(clientLibCSS, {});

							// Write the files
							grunt.file.write(fullClientLibPath + '/styles.css', clientLibCSS, { encoding: 'utf8' });
							grunt.file.write(fullClientLibPath + '/css.txt', '#base=.\r\nstyles.css', { encoding: 'utf8' });
							grunt.file.write(minClientLibPath + '/styles.css', minClientLibCSS, { encoding: 'utf8' });
							grunt.file.write(minClientLibPath + '/css.txt', '#base=.\r\nstyles.css', { encoding: 'utf8' });
						}

						// Create the JS
						if (Array.isArray(clientLibJSObj) && clientLibJSObj.length > 0) {
							// Sort the array into dependency order
							clientLibJSObj = performSort(clientLibJSObj);

							// Generate and minify the string
							for (var j = 0; j < clientLibJSObj.length; j = j + 1) {
								clientLibJS += clientLibJSObj[j].fileContent + '\r\n';
							}
							minClientLibJS = compressJS(clientLibJS);

							// Write the files
							grunt.file.write(fullClientLibPath + '/classes.js', clientLibJS, { encoding: 'utf8' });
							grunt.file.write(fullClientLibPath + '/js.txt', '#base=.\r\nclasses.js', { encoding: 'utf8' });
							grunt.file.write(minClientLibPath + '/classes.js', minClientLibJS, { encoding: 'utf8' });
							grunt.file.write(minClientLibPath + '/js.txt', '#base=.\r\nclasses.js', { encoding: 'utf8' });
						}
					}
				}
			}
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

			for (i = 0; i < propCount; i = i + 1) {
				propName = props[i];
				sourceVal = source[propName];
				targetVal = target[propName];

				if (typeof sourceVal !== 'undefined' && (typeof targetVal === 'undefined' || typeof targetVal === typeof sourceVal)) {
					target[propName] = sourceVal;
				}
			}
		}

		// Configure this task
		if (isValidObject(options)) {
			transferConfigs(options, config);
			if (isValidObject(options.minSettings)) {
				transferConfigs(options.minSettings, compressorConfig);
			}
		}

		// Clean files
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
				});
			}
		});

		// Find the appropriate files
		this.files.forEach(function (file) {
			file.src.forEach(function (sourcePath, index, arr) {
				grunt.log.writeln(sourcePath);
				addFile(sourcePath);
			});
		});

		// Create the client libraries
		createClientLibs();
	});
};