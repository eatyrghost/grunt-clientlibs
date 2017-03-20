/*global require:true, module:true, options:true */
// Requires
var fs = require('fs'),
	path = require('path'),
	recursive = require('recursive-readdir'),
	spook = require('spook-utils'),
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
				compressCSS: true,
				cssDependPrefix: '',
				fullSuffix: '',
				includes: {},
				jsDependPrefix: '',
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
				if (spook.validString(fileContent) === '') {
					return;
				}
			} catch (e) {
				return;
			}
			// Perform pattern matching
			var clientLib = {
					'depends': [],
					'fileName': file.replace('./', '')
				},
				clientLibPattern = /(\@clientlib )([a-zA-Z0-9\.\-\_]{0,})/g,
				clientLibMatches = fileContent.match(clientLibPattern),
				clientLibIsArray = Array.isArray(clientLibMatches),
				dependPattern = /(\@depend(s|) )([a-zA-Z0-9\/\.\-\_]{0,})/g,
				dependMatches = fileContent.match(dependPattern),
				dependIsArray = Array.isArray(dependMatches),
				mentions = [],
				newMentions = [];

			// Populate the object
			if (dependIsArray === true) {
				dependMatches.forEach(function (matchStr) {
					var dependName = matchStr.replace('@depends', '').replace('@depend', '').trim();
					clientLib.depends.push(dependName);
					mentions.push(dependName);
				});
			}

			// Add the object to the appropriate client libraries
			if (clientLibIsArray === true) {
				clientLibMatches.forEach(function (matchStr) {
					var clientLibName = matchStr.replace('@clientlib', '').trim(),
						clientLibRef = clientLibs[clientLibName];

					if (clientLibName !== '') {
						// Create the client library object if it doesn't exist
						if (spook.validObject(clientLibRef) === null) {
							clientLibs[clientLibName] = {
								'contains': [],
								'css': [],
								'js': [],
								'mentions': []
							};
							clientLibRef = clientLibs[clientLibName];
						}
						if (clientLibRef.contains.indexOf(file) === -1) {
							clientLibRef.contains.push(file);

							if (file.indexOf('.css') > -1) {
								clientLibRef.css.push(clientLib);
							} else if (file.indexOf('.js') > -1) {
								clientLibRef.js.push(clientLib);
							}
						}

						// Populate and filter the mentions
						newMentions = clientLibRef.mentions.concat(mentions);
						newMentions = newMentions.filter(function (item, index, array) {
							return array.indexOf(item) === index;
						});
						clientLibRef.mentions = newMentions;
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
			if (spook.validString(source) !== '') {
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
				clientLibIncludes = '',
				clientLibPath = config.clientLibPath,
				clientLibName = '',
				clientLibObj = {},
				clientLibCSS = '',
				clientLibCSSObj = {},
				clientLibIncludeObj = null,
				clientLibJS = '',
				clientLibJSObj = {},
				dependsContent = '',
				fullClientLibPath = '',
				fullClientLibXML = '',
				mentionIndex = -1,
				minClientLibCSS = '',
				minClientLibJS = '',
				minClientLibPath = '',
				minClientLibXML = '';

			for (var i = 0; i < clientLibCount; i = i + 1) {
				clientLibCSS = '';
				clientLibIncludes = '',
				clientLibJS = '';
				clientLibName = (clientLibNames[i] + '').trim();
				fullClientLibPath = clientLibPath + clientLibName + config.fullSuffix;
				fullClientLibXML = clientLibXML.replace(/\$\$NAME\$\$/g, clientLibName + config.fullSuffix);
				minClientLibPath = clientLibPath + clientLibName + config.minSuffix;
				minClientLibXML = clientLibXML.replace(/\$\$NAME\$\$/g, clientLibName + config.minSuffix);

				// Filter invalid names
				if (clientLibName === '') {
					continue;
				} else {
					clientLibIncludeObj = getIncludeObject(clientLibName);
					clientLibObj = clientLibs[clientLibName];

					// Do we have a valid client library object
					if (spook.isValidObject(clientLibObj) === true) {
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
						writeFile(fullClientLibPath + '/.content.xml', fullClientLibXML);
						writeFile(minClientLibPath + '/.content.xml', minClientLibXML);

						// Create the CSS
						if (Array.isArray(clientLibCSSObj) && clientLibCSSObj.length > 0) {
							// Retrieve any includes
							clientLibCSS = getIncludeString(clientLibName, 'css');

							// Sort the array into dependency order
							clientLibCSSObj = performSort(clientLibCSSObj);

							// Generate and minify the string
							for (var j = 0; j < clientLibCSSObj.length; j = j + 1) {
								clientLibCSS += grunt.file.read(clientLibCSSObj[j].fileName, { encoding: 'utf8' }) + '\r\n';

								// Remove mentions for found CSS files
								mentionIndex = clientLibObj.mentions.indexOf(clientLibCSSObj[j].fileName);
								if (mentionIndex === -1 && config.cssDependPrefix !== '') {
									mentionIndex = clientLibObj.mentions.indexOf(clientLibCSSObj[j].fileName.replace(config.cssDependPrefix, ''));
								}
								if (mentionIndex > -1) {
									clientLibObj.mentions.splice(mentionIndex, 1);
								}
							}
							if (config.compressCSS === true) {
								minClientLibCSS = uglifycss.processString(clientLibCSS, {});
							} else {
								minClientLibCSS = clientLibCSS;
							}

							// Write the files
							writeFile(fullClientLibPath + '/styles.css', clientLibCSS);
							writeFile(fullClientLibPath + '/css.txt', '#base=.\r\nstyles.css');
							writeFile(minClientLibPath + '/styles.css', minClientLibCSS);
							writeFile(minClientLibPath + '/css.txt', '#base=.\r\nstyles.css');
						}

						// Create the JS
						if (Array.isArray(clientLibJSObj) && clientLibJSObj.length > 0) {
							// Retrieve any includes
							clientLibJS = getIncludeString(clientLibName, 'js');

							// Sort the array into dependency order
							clientLibJSObj = performSort(clientLibJSObj);

							// Generate and minify the string
							for (var j = 0; j < clientLibJSObj.length; j = j + 1) {
								clientLibJS += grunt.file.read(clientLibJSObj[j].fileName, { encoding: 'utf8' }) + '\r\n';

								// Remove mentions for found CSS files
								mentionIndex = clientLibObj.mentions.indexOf(clientLibJSObj[j].fileName);
								if (mentionIndex === -1 && config.jsDependPrefix !== '') {
									mentionIndex = clientLibObj.mentions.indexOf(clientLibJSObj[j].fileName.replace(config.jsDependPrefix, ''));
								}
								if (mentionIndex > -1) {
									clientLibObj.mentions.splice(mentionIndex, 1);
								}
							}
							minClientLibJS = compressJS(clientLibJS);

							// Write the files
							// @TODO Add a flag for preminified in production clientlibs
							writeFile(fullClientLibPath + '/classes.js', clientLibJS);
							writeFile(fullClientLibPath + '/js.txt', '#base=.\r\nclasses.js');
							writeFile(minClientLibPath + '/classes.js', minClientLibJS);
							writeFile(minClientLibPath + '/js.txt', '#base=.\r\nclasses.js');
						}

						// Write out the list of files contained in the client library
						if (clientLibIncludeObj !== null && Array.isArray(clientLibIncludeObj.css) === true) {
							clientLibIncludes += 'External CSS:\r\n\r\n';
							clientLibIncludes += clientLibIncludeObj.css.join('\r\n');
							clientLibIncludes += '\r\n\r\n';
						}
						if (clientLibIncludeObj !== null && Array.isArray(clientLibIncludeObj.js) === true) {
							clientLibIncludes += 'External JS:\r\n\r\n';
							clientLibIncludes += clientLibIncludeObj.js.join('\r\n');
							clientLibIncludes += '\r\n\r\n';
						}
						if (Array.isArray(clientLibObj.contains) === true) {
							clientLibIncludes += 'Contained Files:\r\n\r\n';
							clientLibIncludes += clientLibObj.contains.join('\r\n');
						}
						if (clientLibIncludes !== '') {
							writeFile(fullClientLibPath + '/includes.txt', clientLibIncludes);
							writeFile(minClientLibPath + '/includes.txt', clientLibIncludes);
						}

						// Write out the list of dependencies that were mentioned but not included
						if (clientLibObj.mentions.length > 0) {
							dependsContent = clientLibObj.mentions.join('\r\n');
							writeFile(fullClientLibPath + '/depends.txt', dependsContent);
							writeFile(minClientLibPath + '/depends.txt', dependsContent);
						}
					}
				}
			}
		}

		/**
		 * @function getIncludeObject
		 * @description Reads any includes of the given type for the client library
		 * @param {string} clientLibName The name of the client library
		 * @returns {object}
		 */
		function getIncludeObject(clientLibName) {
			if (spook.validString(clientLibName) === '') {
				return null;
			} else {
				return spook.validObject(config.includes[clientLibName]);
			}
		}

		/**
		 * @function getIncludeString
		 * @description Reads any includes of the given type for the client library
		 * @param {string} clientLibName The name of the client library
		 * @param {string} includeType The type of includes to retrieve
		 * @returns {string}
		 */
		function getIncludeString(clientLibName, includeType) {
			if (spook.validString(clientLibName) === '' || spook.validString(includeType) === '') {
				return '';
			}

			var includeObj = getIncludeObject(clientLibName),
				includeTypeObj = null,
				includeFile = '',
				includeFileContent = '',
				returnValue = '';

			if (spook.isValidObject(includeObj) === false) {
				return '';
			} else {
				includeTypeObj = includeObj[includeType];

				if (spook.isValidObject(includeTypeObj) === false || Array.isArray(includeTypeObj) === false) {
					return '';
				}
			}

			for (var i = 0; i < includeTypeObj.length; i = i + 1) {
				includeFile = includeTypeObj[i];
				includeFileContent = grunt.file.read(includeFile, { encoding: 'utf8' });

				if (spook.validString(includeFileContent) !== '') {
					returnValue += includeFileContent;
				}
			}

			return returnValue;
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
			var returnValue = 0,
				cleanFileA = fileA.fileName.replace('./', '').replace(config.cssDependPrefix, '').replace(config.jsDependPrefix, ''),
				cleanFileB = fileB.fileName.replace('./', '').replace(config.cssDependPrefix, '').replace(config.jsDependPrefix, '');

			if (fileB.depends.indexOf(cleanFileA) > -1) {
				returnValue = -1;
			} else if (fileA.depends.indexOf(cleanFileB) > -1) {
				returnValue = 1;
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

		/**
		 * @function writeFile
		 * @description Attempts to write a file to the file system with common settings
		 * @param {string} path The path to write the file to
		 * @param {string} content The content for the file
		 * @returns {void}
		 */
		function writeFile(path, content) {
			try {
				grunt.file.write(path, content, { encoding: 'utf8' });
			} catch (e) {
			}
		}

		// Configure this task
		if (spook.isValidObject(options) === true) {
			transferConfigs(options, config);
			if (spook.isValidObject(options.minSettings) === true) {
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
				addFile(sourcePath);
			});
		});

		// Create the client libraries
		createClientLibs();
	});
};