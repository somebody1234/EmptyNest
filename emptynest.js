var input = '',
	rEmpty = /\s*(?:[\r\n]+|$)/yi,
	rLet = /\s*let\s+?([\s\S])\s+=([^=\r\n]+)(?:[\r\n]+|$)/yi,
	rNonTerminating = /(.*) -> (.*)(?:[\r\n]+|$)/yi,
	rTerminating = /(.*) -\| (.*)(?:[\r\n]+|$)/yi;

function balanced(s) {
	var depth = 0;
	for (var i = 0; i < s.length; i++) {
		if (s[i] == '(') {
			depth++;
		} else {
			depth--;
		}
		if (depth < 0) return false;
	}
	return !depth;
}

function parseParens(code, depth, indexObj) {
	indexObj = indexObj || {value: 0};
	var result = [];
	if (depth) {
		while (indexObj.value < code.length) {
			if (code[indexObj.value++] != '(') {
				break;
			}
			result.push(parseParens(code, depth - 1, indexObj));
			if (indexObj.value > code.length + 1) {
				throw 'Unclosed open parenthesis';
			}
		}
	} else {
		var currentDepth = 0, index = indexObj.value, start = index;
		while (index < code.length) {
			if (code[index++] == '(') {
				currentDepth++;
			} else {
				currentDepth--;
			}
			if (!currentDepth) {
				result.push(code.slice(start, index));
				start = index;
			}
			if (currentDepth < 0) {
				break;
			}
		}
		if (currentDepth != 0 && currentDepth != -1) {
			throw 'Unclosed open parenthesis';
			process.exit(1);
		}
		indexObj.value = index;
	}
	return result;
}

function parseLet(code, indexObj, reverse) {
	var index = indexObj.value, success = true, lookup = {};
	while (success) {
		rEmpty.lastIndex = rLet.lastIndex = index;
		if (rEmpty.exec(code)) {
			index = rEmpty.lastIndex;
		} else if (match = rLet.exec(code)) {
			var parens = match[2].replace(/[^()]+/g, '');
			if (!balanced(parens)) {
				console.error('Variable \'' + match[1] + '\' has unbalanced representation');
				process.exit(1);
			}
			if (reverse) {
				lookup[match[1]] = parens;
			} else {
				lookup[parens] = match[1];
			}
			index = rLet.lastIndex;
		} else {
			success = false;
		}
	}
	indexObj.value = index;
	return lookup;
}

function parse(code, doReturnLookup) {
	var success = true, rules = [],
		depth = 0,
		indexObj = {value: 0},
		lookup = parseLet(code, indexObj);
	if (doReturnLookup) {
		rules.lookup = lookup;
	}
	var ruleIndexObj = {value: 0},
		ruleCode = code.slice(indexObj.value).replace(/[^()]+/g, ''),
		rawRules = parseParens(ruleCode, 2, ruleIndexObj);
	if (ruleIndexObj.value > ruleCode.length + 1) {
		throw 'Unclosed open parenthesis';
	}
	if (ruleIndexObj.value < ruleCode.length) {
		throw 'Extraneous close parenthesis';
	}
	for (var i = 0; i < rawRules.length; i++) {
		var rawRule = rawRules[i];
		if (rawRule.length == 2) {
			rules.push([rawRule[0].map(s => lookup[s]).join(''), rawRule[1].map(s => lookup[s]).join(''), 0]);
		} else {
			if (rawRule[0].length == 2) {
				var match = parseParens(rawRule[0][0], 1)[0],
					replace = parseParens(rawRule[0][1], 1)[0];
				rules.push([match.map(s => lookup[s]).join(''), replace.map(s => lookup[s]).join(''), 1]);
			} else {
				rules.push(['', rawRule[0].map(s => lookup[s]).join(''), 0])
			}
		}
	}
	return rules;
}

function parseSane(code, doReturnLookup) {
	var success = true, rules = [], match,
		indexObj = {value: 0},
		lookup = parseLet(code, indexObj, true),
		index = indexObj.value;
	if (doReturnLookup) {
		rules.lookup = lookup;
	}
	while (success) {
		rNonTerminating.lastIndex = rTerminating.lastIndex = index;
		if (match = rNonTerminating.exec(code)) {
			if (!match[2].length) {
				console.error('Replacement cannot be empty string');
				process.exit(1);
			}
			rules.push([match[1], match[2], 0]);
			index = rNonTerminating.lastIndex;
		} else if (match = rTerminating.exec(code)) {
			if (!match[2].length) {
				console.error('Replacement cannot be empty string');
				process.exit(1);
			}
			rules.push([match[1], match[2], 1]);
			index = rTerminating.lastIndex;
		} else {
			success = false;
		}
	}
	indexObj.value = index;
	return rules;
}

function sanify(code) {
	var result = '', rules = parse(code, true);
	for (var key in rules.lookup) {
		result += 'Let ' + rules.lookup[key] + ' = ' + key + '\n';
	}
	for (var i = 0; i < rules.length; i++) {
		result += rules[i][0] + (rules[i][2] ? ' -| ' : ' -> ') + rules[i][1] + '\n';
	}
	return result;
}

function insanify(code) {
	var result = '', rules = parseSane(code, true);
	for (var key in rules.lookup) {
		result += 'Let ' + key + ' = ' + rules.lookup[key] + '\n';
	}
	for (var i = 0; i < rules.length; i++) {
		result += (rules[i][2] ? '(((' : '((') + rules[i][0].replace(/./g, c => rules.lookup[c]) + ')(' + rules[i][1].replace(/./g, c => rules.lookup[c]) + (rules[i][2] ? ')))' : '))');
	}
	return result;
}

function run(string, rules) {
	var keepRunning = true, success = false;
	while (keepRunning) {
		for (var i = 0; i < rules.length; i++) {
			var rule = rules[i];
			if (string.includes(rule[0])) {
				string = string.replace(rule[0], rule[1]);
				if (rule[2]) {
					keepRunning = false;
				}
				success = true;
				break;
			}
		}
		if (!success) {
			console.error('No match found for string \'' + string + '\'');
			process.exit(1);
		}
	}
	return string;
}

function help() {
	console.log('\
node emptynest.js [FILE] [ARGUMENTS] < [INPUT]\n\
\n\
Arguments:\n\
-c	--code		[CODE]	Use code [CODE] instead of reading from a file\n\
-i	--input		[INPUT]	Use input [INPUT]\n\
-r	--run			Run code. Enabled by default but can be used to reenable with transpile\n\
-s	--sane			Use the sane (readable) mode to parse the code. Note that this is not Empty Nest, merely a way to edit it quickly\n\
-t	--transpile		If set, convert from/to sane mode\n\
-u	--unescape		If set, replace C-style escapes with literal characters\n\
-f	--file		[FILE]	Read code from file\n\
-h	--help			Show this help message');
	process.exit(0);
}

function handleArgs() {
	var code = '', input = '', doRun = 1, sane = false, doTranspile = false, doUnescape = false;
	if (process.argv.length <= 2) {
		help;
	}
	for (var i = 2; i < process.argv.length; i++) {
		var item = process.argv[i];
		if (item[0] == '-' && item[1] != '-' && item.length > 2) {
			for (var j = 2; j < item.length; j++) {
				process.argv.splice(i + j - 1, 0, '-' + item[j]);
			}
			item = process.argv[i] = item.slice(0, 2);
		}
		switch (item) {
			case '-c':
			case '--code':
				if (i == process.argv.length - 1) {
					console.error('Expected code after \'-c\'/\'--code\' flag');
					process.exit(1);
				}
				code += process.argv[++i];
				break;
			case '-i':
			case '--input':
				if (i == process.argv.length - 1) {
					console.error('Expected input after \'-i\'/\'--input\' flag');
					process.exit(1);
				}
				input += process.argv[++i];
				break;
			case '-h':
			case '--help':
				help();
				break;
			case '-r':
			case '--run':
				doRun = true;
				break;
			case '-s':
			case '--sane':
				sane = true;
				break;
			case '-t':
			case '--transpile':
				doRun = run == true;
				doTranspile = true;
				break;
			case '-u':
			case '--unescape':
				doUnescape = true;
				break;
			case '-f':
			case '--file':
				if (i == process.argv.length - 1) {
					console.error('Expected file path after \'-f\'/\'--file\' flag');
					process.exit(1);
				}
				item = process.argv[++i];
			default:
				code += require('fs').readFileSync(item).toString();
				break;
		}
	}
	process.stdin.on('data', function(chunk) {
		input += chunk;
	});
	process.stdin.on('end', function() {
		if (doRun) {
			var output = run(input, (sane ? parseSane : parse)(code));
			process.stdout.write(doUnescape ? JSON.parse('"' + output.replace(/"/g, '\\"') + '"') : output)
		}
		if (doTranspile) {
			if (doRun) {
				console.log();
			}
			console.log('=== TRANSPILED EMPTY NEST START ===');
			console.log((sane ? insanify : sanify)(code));
		}
	});
}

handleArgs();
