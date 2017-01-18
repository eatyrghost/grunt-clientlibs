# grunt-clientlibs
Reads `JSDoc`/`SASSDoc`-style `@depend` and `@clientlib` notations to generate Adobe Experience Manager (AEM) client libraries dynamically.

## Quick start: configuration options

This module supports the following configurations:

* `clientLibPath {string}`: Defaults to `'./clientlibs/'` - this is the path to create client library files in
* `minSettings {object}`: Over-ride the default settings passed to the uglifyjs.Compressor for JS minification
* `minSuffix {string}`: Defaults to `'-min'` - this is the suffix added to the minified client library categories
* `verbose {boolean}`: Defaults to `false` - `true` enables verbose mode for debugging

Please feel free to submit pull requests if you wish to make more items configurable.

This is the simplest `Gruntfile.js` possible:

```
/*global module:true */
module.exports = function (grunt) {
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		clientlibs: {
			files: [
				{
					'src': [
						'./my-css-sources/**/*.css',
						'./my-js-sources/**/*.js'
					]
				}
			]
		}
	});

	grunt.loadNpmTasks('grunt-clientlibs');
};
```

This is how you would change all options:

```
/*global module:true */
module.exports = function (grunt) {
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		clientlibs: {
			files: [
				{
					'src': [
						'./my-css-sources/**/*.css',
						'./my-js-sources/**/*.js'
					]
				}
			],
			options: {
				clientLibPath: '../src/content/jcr_root/etc/designs/myDesign/clientlibs/',
				minSettings: {
					// Accepts all the same properties as the uglifyjs.Compressor
					// See: http://lisperator.net/uglifyjs/compress
				},
				minSuffix: '.min',
				verbose: true
			}
		}
	});

	grunt.loadNpmTasks('grunt-clientlibs');
};
```

## General overview: what does it do?

When it comes to front end, AEM has a lot of features and best practices that make writing clean, reusable code, using the latest tools and philosophies, very difficult. It's opinionated and laden with gotchas.

This module is intended to allow teams to create front end projects that reflect the best workflows out there, gaining access to a huge library of modules and tools, and package the code in a way that AEM is happy with once they're done.

This also allows teams to share their code between multiple projects - have different Grunt tasks that package your code for AEM, a private Bower repository, and other destinations, share commonly-used code cleanly, and more.

Your sources dictate how to structure the code for AEM, AEM does not dictate how you structure your sources. Tag files to add them to specific client libraries at build time - generating both a normal, expanded version of your sources for debugging, and a preminified version for production.

Client libraries created look like this:

```
/<client library name>
	/.content.xml
	/classes.js
	/css.txt
	/js.txt
	/styles.css
/<client library name><minSuffix>
	/.content.xml
	/classes.js
	/css.txt
	/js.txt
	/styles.css
```

## Preparing your sources for dynamic compilation

### Folder structure

This documentation assumes your sources are nested within a single root directory - a recommended structure resembles the following:

```
/root
	/clientlibs
	/css
		/... organized CSS folders
	/js
		/... organized JS folders
	/node_modules
	/sass
		/... organized SASS folders
	Gruntfile.js
	package.json
```

### Related reading

We also recommend you read up on the [JSDoc](http://usejsdoc.org) and [SASSDoc](http://sassdoc.com) code notation formats. There are fantastic Node/Grunt modules to dynamically generation documentation if you use these consistently.

### Minification/compression caveats

The process of notating files is the same between JavaScript and SASS/CSS, although there are a couple of key caveats:

* Avoid minifying your JavaScript _before_ running this process. Minification removes comments, and this module won't be able to retrieve them.
* When compiling your SASS to CSS, ensure you are using the multiline comment format and that you are using a compilation style that does not suppress them in the resulting CSS.

### Notating your source files

A typical `JSDoc` block might look like this:

```
/**
 * @class MyNamespace.MyClass
 * @description A summary explaining what this class does
 * @memberOf MyNamespace
 * @clientlib myclientlib
 * @depend js/path-to-first-file-this-class-depends-on/file.js
 * @depend js/path-to-second-file-this-class-depends-on/file.js
 */
```
This module only cares about `@clientlib` and `@depend`.

* `@clientlib`: This is the category name for the client library you wish to add this file to. You can add a file to multiple client libraries, but this could lead to duplicate code on your web pages.
* `@depend` or `@depends`: This is the full path to a file on which this class file depends. For example, if your class uses a library or extends another class file, you would list those files as individual `@depend` items.

Within a SASS file that will explicitly output to a compressed CSS file, add the following block at the start of the file:

```
/**
 * @clientlib myclientlib
 * @depend css/path-to-first-file-this-file-depends-on/file.css
 * @depend css/path-to-second-file-this-file-depends-on/file.css
*/
```

Note that the `@depend` statements refer to the generated CSS files, not the source SASS files.

## Using your new client libraries

Once the module has created your client libraries, you can perform any post-processing you need on the files. This might include:

* Any additional compression or minification
* Versioning and tagging
* Deployment to AEM

### Using your client libraries on your templates

For each client library, two versions are generated. If you notated files with `@clientlib foo-bar` you will find a folder named `foo-bar` and a folder named `foo-bar-min` in your output folder.

Out-of-the-box, AEM offers its own minification for client libraries. You can enable and disable this, along with GZIP compression, by editing the HTML Library Manager configuration on a given environment at:

```
/system/console/configMgr
```

For example, on a local development machine:

```
http://localhost:4502/system/console/configMgr
```

Depending on your version of AEM, this might be based on an extremely old version of the YUI Compressor, which has significant issues with modern JavaScript - lacking an understanding of newer ECMAScript syntax, Angular, and other modern technologies. Troubleshooting and resolving these issues is a huge challenge for teams on the cutting edge.

An alternative to this is to programmatically determine when to use the minified version of the client library generated by this module. For example, you might wish to switch based on runmode or a query string parameter:

```
<%@page import="org.apache.sling.settings.SlingSettingsService" %>
<%
SlingSettingsService settings = sling.getService(SlingSettingsService.class);
String expandClientLibs = request.getParameter("expandClientLibs");
if (!settings.getRunModes().contains("publish") || expandClientLibs.equals("true")) {
	%><cq:includeClientLib categories="foo-bar" /><%
} else {
	%><cq:includeClientLib categories="foo-bar-min" /><%
}
%>
```

