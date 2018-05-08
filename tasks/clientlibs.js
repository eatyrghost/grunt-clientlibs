/*global require:true, module:true, options:true */
// Requires
const fs = require('fs'),
	recursive = require('recursive-readdir'),
	smize = require('smize'),
	uglifycss = require('uglifycss'),
	uglifyjs = require('uglify-js'),
	valid = smize.valid;

// Declare the module
module.exports = function (grunt) {
	'use strict';

	grunt.registerMultiTask('clientlibs', 'Dynamically generate AEM client libraries', function () {
		var CLIENT_LIB = '@clientlib',
			DEPEND = '@depend',
			DEPENDS = '@depends',
			LINE_BREAK = '\r\n',
			clientLibs = {},
			clientLibXML = '<?xml version="1.0" encoding="UTF-8"?>\r\n<jcr:root xmlns:cq="http://www.day.com/jcr/cq/1.0" xmlns:jcr="http://www.jcp.org/jcr/1.0"\r\njcr:primaryType="cq:ClientLibraryFolder"\r\njcr:title="$$NAME$$"\r\ncategories="[$$NAME$$]" />',
			compressorConfig = {
				booleans: true,
				cascade: true,
				comparisons: true,
				conditionals: true,
				dead_code: true,
				drop_debugger: true,
				evaluate: true,
				hoist_funs: true,
				hoist_vars: false,
				if_return: true,
				join_vars: true,
				loops: true,
				properties: false,
				sequences: true,
				side_effects: true,
				unsafe: false,
				unused: false,
				warnings: true,
				global_defs: {}
			},
			config = {
				clientLibPath: './clientlibs/',
				compressCSS: true,
				compressJS: true,
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
			var fileContent = '';

			try {
				fileContent = grunt.file.read(file, {
					encoding: 'utf8'
				});
				if (valid.validString(fileContent) === '') {
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
					var dependName = matchStr.replace(DEPENDS, '').replace(DEPEND, '').trim();
					clientLib.depends.push(dependName);
					mentions.push(dependName);
				});
			}

			// Add the object to the appropriate client libraries
			if (clientLibIsArray === true) {
				clientLibMatches.forEach(function (matchStr) {
					var clientLibName = matchStr.replace(CLIENT_LIB, '').trim(),
						clientLibRef = clientLibs[clientLibName];

					if (clientLibName !== '') {
						// Create the client library object if it doesn't exist
						if (!valid.isValidObject(clientLibRef)) {
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
			if (valid.isValidString(source)) {
				// Attempt minification
				try {
					tree = uglifyjs.parse(source);
					tree.figure_out_scope();
					compressor = uglifyjs.Compressor(compressorConfig);
					tree = tree.transform(compressor);
					returnValue = tree.print_to_string();
				} catch (e) {}
			}

			// Return minified JS if possible
			return returnValue;
		}
		/**
		 * @function createClientLibs
		 * @description Attempts to create client library files from an object collection
		 * @returns {void}
		 */
		function createClientLibs() {
			var clientLibNames = Object.keys(clientLibs),
				clientLibCount = clientLibNames.length,
				clientLibIncludes = '',
				clientLibPath = config.clientLibPath,
				clientLibName = '',
				clientLibObj = {},
				clientLibCSS = '',
				clientLibCSSObj = {},
				clientLibCSSOrderObj = {},
				clientLibIncludeObj = null,
				clientLibIncludeOrderObjCSS = [],
				clientLibIncludeOrderObjJS = [],
				clientLibJS = '',
				clientLibJSObj = {},
				clientLibJSOrderObj = {},
				dependsContent = '',
				fullClientLibPath = '',
				fullClientLibXML = '',
				i = 0,
				j = 0,
				mentionIndex = -1,
				minClientLibCSS = '',
				minClientLibJS = '',
				minClientLibPath = '',
				minClientLibXML = '',
				len = 0;

			for (i = 0; i < clientLibCount; i++) {
				clientLibCSS = '';
				clientLibIncludes = '';
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
					if (valid.isValidObject(clientLibObj)) {
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
							clientLibCSSOrderObj = performSort(clientLibCSSObj);

							// Generate and minify the string
							clientLibIncludeOrderObjCSS = [];
							len = clientLibCSSOrderObj.length;

							for (j = 0; j < len; j++) {
								clientLibCSS += grunt.file.read(clientLibCSSOrderObj[j].fileName, {
									encoding: 'utf8'
								}) + LINE_BREAK;
								clientLibIncludeOrderObjCSS.push(clientLibCSSOrderObj[j].fileName);

								// Remove mentions for found CSS files
								mentionIndex = clientLibObj.mentions.indexOf(clientLibCSSOrderObj[j].fileName);
								if (mentionIndex === -1 && config.cssDependPrefix !== '') {
									mentionIndex = clientLibObj.mentions.indexOf(clientLibCSSOrderObj[j].fileName.replace(config.cssDependPrefix, ''));
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
							writeFile(fullClientLibPath + '/css.txt', '#base=.' + LINE_BREAK + 'styles.css');
							writeFile(minClientLibPath + '/styles.css', minClientLibCSS);
							writeFile(minClientLibPath + '/css.txt', '#base=.' + LINE_BREAK + 'styles.css');
						}

						// Create the JS
						if (Array.isArray(clientLibJSObj) && clientLibJSObj.length > 0) {
							// Retrieve any includes
							clientLibJS = getIncludeString(clientLibName, 'js');

							// Sort the array into dependency order
							clientLibJSOrderObj = performSort(clientLibJSObj);

							// Generate and minify the string
							clientLibIncludeOrderObjJS = [];
							len = clientLibJSOrderObj.length;
							for (j = 0; j < len; j++) {
								clientLibJS += grunt.file.read(clientLibJSOrderObj[j].fileName, {
									encoding: 'utf8'
								}) + LINE_BREAK;
								clientLibIncludeOrderObjJS.push(clientLibJSOrderObj[j].fileName);

								// Remove mentions for found CSS files
								mentionIndex = clientLibObj.mentions.indexOf(clientLibJSOrderObj[j].fileName);
								if (mentionIndex === -1 && config.jsDependPrefix !== '') {
									mentionIndex = clientLibObj.mentions.indexOf(clientLibJSOrderObj[j].fileName.replace(config.jsDependPrefix, ''));
								}
								if (mentionIndex > -1) {
									clientLibObj.mentions.splice(mentionIndex, 1);
								}
							}

							if (config.compressJS === true) {
								minClientLibJS = compressJS(clientLibJS);
							} else {
								minClientLibJS = clientLibJS;
							}

							// Write the files
							// @TODO Add a flag for preminified in production clientlibs
							writeFile(fullClientLibPath + '/classes.js', clientLibJS);
							writeFile(fullClientLibPath + '/js.txt', '#base=.' + LINE_BREAK + 'classes.js');
							writeFile(minClientLibPath + '/classes.js', minClientLibJS);
							writeFile(minClientLibPath + '/js.txt', '#base=.' + LINE_BREAK + 'classes.js');
						}

						// Write out the list of files contained in the client library
						if (clientLibIncludeObj !== null && Array.isArray(clientLibIncludeObj.css) === true) {
							clientLibIncludes += 'External CSS:';
							clientLibIncludes += LINE_BREAK;
							clientLibIncludes += LINE_BREAK;
							clientLibIncludes += clientLibIncludeObj.css.join(LINE_BREAK);
							clientLibIncludes += LINE_BREAK;
							clientLibIncludes += LINE_BREAK;
						}
						if (clientLibIncludeObj !== null && Array.isArray(clientLibIncludeObj.js) === true) {
							clientLibIncludes += 'External JS:';
							clientLibIncludes += LINE_BREAK;
							clientLibIncludes += LINE_BREAK;
							clientLibIncludes += clientLibIncludeObj.js.join(LINE_BREAK);
							clientLibIncludes += LINE_BREAK;
							clientLibIncludes += LINE_BREAK;
						}
						if (Array.isArray(clientLibObj.contains) === true) {
							clientLibIncludes += 'Contained Files:';
							clientLibIncludes += LINE_BREAK;
							clientLibIncludes += LINE_BREAK;
							clientLibIncludes += clientLibIncludeOrderObjCSS.join(LINE_BREAK);
							clientLibIncludes += LINE_BREAK;
							clientLibIncludes += LINE_BREAK;
							clientLibIncludes += clientLibIncludeOrderObjJS.join(LINE_BREAK);
						}
						if (clientLibIncludes !== '') {
							writeFile(fullClientLibPath + '/includes.txt', clientLibIncludes);
							writeFile(minClientLibPath + '/includes.txt', clientLibIncludes);
						}

						// Write out the list of dependencies that were mentioned but not included
						if (clientLibObj.mentions.length > 0) {
							dependsContent = clientLibObj.mentions.join(LINE_BREAK);
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
			if (!valid.isValidString(clientLibName)) {
				return null;
			} else {
				return valid.validObject(config.includes[clientLibName]);
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
			if (!valid.isValidString(clientLibName) || !valid.isValidString(includeType)) {
				return '';
			}

			var includeObj = getIncludeObject(clientLibName),
				includeTypeObj = null,
				includeFile = '',
				includeFileContent = '',
				returnValue = '';

			if (!valid.isValidObject(includeObj)) {
				return '';
			} else {
				includeTypeObj = includeObj[includeType];

				if (!valid.isValidObject(includeTypeObj) || !Array.isArray(includeTypeObj)) {
					return '';
				}
			}

			for (var i = 0; i < includeTypeObj.length; i++) {
				includeFile = includeTypeObj[i];
				includeFileContent = grunt.file.read(includeFile, {
					encoding: 'utf8'
				});

				if (valid.isValidString(includeFileContent)) {
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
			var arrLength = arr.length,
				i = 0,
				resultArray = [],
				item = {};

			for (i = 0; i < arrLength; i++) {
				item = arr[i];
				if (checkIfAlreadySortedForFile(item, resultArray) === false) {
					sortFn(item, arr, resultArray);
				}
			}

			return resultArray;
		}
		/**
		 * @function getDependFile
		 * @description A helper method to check if have depends in this client libs
		 * @param {string} dependFileName The name of the file
		 * @param {array} remainArray The array of remaining dependencies
		 * @returns {object} return null if there is no dependencies in this library, file return specific dependency file
		 */
		function getDependFile(dependFileName, remainArray) {
			var i = 0,
				dependName = '',
				remainArrayLength = remainArray.length,
				specificFileName = '';

			for (i = 0; i < remainArrayLength; i++) {
				dependName = removeSlashAndFileExtension(dependFileName);
				specificFileName = removeSlashAndFileExtension(remainArray[i].fileName);
				if (dependName === specificFileName) {
					return remainArray[i];
				}
			}

			return null;
		}
		/**
		 * @function sortFn
		 * @param {object} fileObj The file to sort against
		 * @param {array} remainArray The files that have not yet been sorted
		 * @param {array} resultArray The files that have been sorted
		 * @returns {void}
		 */
		function sortFn(fileObj, remainArray, resultArray) {
			var depends = fileObj.depends,
				i = 0,
				len = depends.length,
				filterResult = null;

			for (i = 0; i < len; i++) {
				filterResult = getDependFile(depends[i], remainArray);

				if (filterResult !== null) {
					sortFn(filterResult, remainArray, resultArray);
				}
			}

			if (checkIfAlreadySortedForFile(fileObj, resultArray) === false) {
				resultArray.push(fileObj);
			}
		}
		/**
		 * @function checkIfAlreadySortedForFile
		 * @param {object} current The target file object
		 * @param {array} sortArray The sorted array to check
		 * @return {boolean} Was it already sorted?
		 */
		function checkIfAlreadySortedForFile(current, sortArray) {
			var currentFileName = removeSlashAndFileExtension(current.fileName),
				i = 0,
				sortedArrayLength = sortArray.length,
				sortSpecificFileName = '';

			for (i = 0; i < sortedArrayLength; i++) {
				sortSpecificFileName = removeSlashAndFileExtension(sortArray[i].fileName);

				if (currentFileName === sortSpecificFileName) {
					return true;
				}
			}

			return false;
		}
		/**
		 * @function removeSlashAndFileExtension
		 * @param {string} str The string to format
		 * @return {string} The formatted string
		 */
		function removeSlashAndFileExtension(str) {
			return str.replace(/\//g, '').replace(config.cssDependPrefix, '').replace(config.jsDependPrefix, '');
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

			for (i = 0; i < propCount; i++) {
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
				grunt.file.write(path, content, {
					encoding: 'utf8'
				});
			} catch (e) {}
		}

		// Configure this task
		if (valid.isValidObject(options)) {
			transferConfigs(options, config);

			if (valid.isValidObject(options.minSettings)) {
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
					} catch (e) {}
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
