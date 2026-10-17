/* Citadel compatibility 1.7.1. Load BEFORE the game core.
 * Conditional fallbacks for older mobile browsers/WebViews; native methods win.
 * No storage, identity changes, telemetry, or network requests are performed here.
 * Deliberately ES5 syntax so this small bootstrap can run before modern game code.
 */
(function (root) {
  'use strict';
  if (root.CITADEL_COMPAT) return;
  var installed = [], objectToString = Object.prototype.toString;
  var maxLength = 9007199254740991, maxTimer = 2147483647;

  function install(target, name, value, label) {
    if (!target || typeof target[name] === 'function') return false;
    Object.defineProperty(target, name, { value: value, configurable: true, writable: true });
    installed.push(label || name);
    return true;
  }
  function integer(value) {
    var number = +value;
    if (number !== number || number === 0) return 0;
    if (number === Infinity || number === -Infinity) return number;
    return number < 0 ? Math.ceil(number) : Math.floor(number);
  }
  function string(value) {
    if (typeof value === 'symbol') throw new TypeError('Cannot convert a Symbol value to a string');
    return String(value);
  }
  function required(value) {
    if (value === null || value === void 0) throw new TypeError('A value is required');
    return value;
  }

  install(Object, 'hasOwn', function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(required(object), key);
  }, 'Object.hasOwn');

  install(Array.prototype, 'at', function at(index) {
    var object = Object(required(this));
    var length = Math.min(Math.max(integer(object.length), 0), maxLength);
    var offset = integer(index), position = offset >= 0 ? offset : length + offset;
    return position < 0 || position >= length ? void 0 : object[position];
  }, 'Array.at');

  function replacementText(template, match, source, position) {
    var output = '', i, next;
    for (i = 0; i < template.length; i++) {
      if (template.charAt(i) !== '$' || i + 1 >= template.length) {
        output += template.charAt(i); continue;
      }
      next = template.charAt(i + 1);
      if (next === '$') output += '$';
      else if (next === '&') output += match;
      else if (next === '`') output += source.slice(0, position);
      else if (next === "'") output += source.slice(position + match.length);
      else { output += '$'; continue; }
      i++;
    }
    return output;
  }
  install(String.prototype, 'replaceAll', function replaceAll(searchValue, replaceValue) {
    var input = required(this), matchSymbol = root.Symbol && root.Symbol.match;
    var replaceSymbol = root.Symbol && root.Symbol.replace, isRegExp, customMatch, method, flags;
    if (searchValue !== null && searchValue !== void 0) {
      customMatch = matchSymbol ? searchValue[matchSymbol] : void 0;
      isRegExp = customMatch !== void 0 ? !!customMatch : objectToString.call(searchValue) === '[object RegExp]';
      if (isRegExp) {
        flags = string(required(searchValue.flags));
        if (flags.indexOf('g') < 0) throw new TypeError('replaceAll requires a global regular expression');
      }
      method = replaceSymbol ? searchValue[replaceSymbol] : void 0;
      if (method !== null && method !== void 0) {
        if (typeof method !== 'function') throw new TypeError('Invalid replacement method');
        return method.call(searchValue, input, replaceValue);
      }
      // A browser without Symbol still has native global RegExp replacement.
      if (!replaceSymbol && isRegExp) return String.prototype.replace.call(input, searchValue, replaceValue);
    }
    var source = string(input), search = string(searchValue), functional = typeof replaceValue === 'function';
    var template = functional ? null : string(replaceValue), output = '', from = 0, end = 0, position;
    while (from <= source.length) {
      position = source.indexOf(search, from);
      if (position < 0) break;
      output += source.slice(end, position);
      output += functional ? string(replaceValue.call(void 0, search, position, source)) : replacementText(template, search, source, position);
      end = position + search.length;
      from = position + Math.max(1, search.length);
    }
    return output + source.slice(end);
  }, 'String.replaceAll');

  var secureCrypto;
  try { secureCrypto = root.crypto; } catch (ignored) {}
  if (secureCrypto && typeof secureCrypto.getRandomValues === 'function') {
    install(secureCrypto, 'randomUUID', function randomUUID() {
      var bytes = new root.Uint8Array(16), hex = [], i;
      secureCrypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      for (i = 0; i < bytes.length; i++) hex.push(('0' + bytes[i].toString(16)).slice(-2));
      return hex.slice(0, 4).join('') + '-' + hex.slice(4, 6).join('') + '-' + hex.slice(6, 8).join('') + '-' + hex.slice(8, 10).join('') + '-' + hex.slice(10).join('');
    }, 'crypto.randomUUID');
  }

  function timeoutError() {
    var error;
    try { error = new root.DOMException('The operation timed out.', 'TimeoutError'); }
    catch (ignored) { error = new Error('The operation timed out.'); error.name = 'TimeoutError'; }
    return error;
  }
  function delayValue(value) {
    var number = +value;
    if (number !== number || number === Infinity || number === -Infinity) throw new TypeError('Invalid timeout');
    var delay = integer(number);
    if (delay < 0 || delay > maxLength) throw new TypeError('Invalid timeout');
    return delay;
  }
  // Schedule long values in bounded chunks instead of overflowing setTimeout.
  function later(callback, delay) {
    var timer = null, cancelled = false;
    function next(remaining) {
      var chunk = Math.min(remaining, maxTimer);
      timer = root.setTimeout(function () {
        if (cancelled) return;
        if (remaining > chunk) next(remaining - chunk); else callback();
      }, chunk);
    }
    next(delay);
    return function () { cancelled = true; if (timer !== null) root.clearTimeout(timer); };
  }

  var signalClass = root.AbortSignal, timeoutMode = signalClass && typeof signalClass.timeout === 'function' ? 'native' : '';
  if (!timeoutMode && typeof root.AbortController === 'function') {
    if (!signalClass) { signalClass = new root.AbortController().signal.constructor; root.AbortSignal = signalClass; }
    install(signalClass, 'timeout', function timeout(milliseconds) {
      var controller = new root.AbortController(), signal = controller.signal;
      var cancel = later(function () { controller.abort(timeoutError()); }, delayValue(milliseconds));
      signal.addEventListener('abort', cancel, { once: true });
      return signal;
    }, 'AbortSignal.timeout');
    timeoutMode = 'controller';
  }
  if (!timeoutMode && typeof root.fetch === 'function' && typeof root.Promise === 'function' && typeof root.WeakMap === 'function') {
    // Very old embedded browsers may provide fetch without AbortController.
    // Only signals made here take this path. All other fetch calls pass through.
    // We bound the caller's wait; this environment cannot cancel the HTTP request.
    var pending = new root.WeakMap(), nativeFetch = root.fetch;
    if (!signalClass) { signalClass = {}; root.AbortSignal = signalClass; }
    install(signalClass, 'timeout', function timeout(milliseconds) {
      var signal = {};
      pending.set(signal, delayValue(milliseconds));
      return signal;
    }, 'AbortSignal.timeout');
    root.fetch = function fetchWithTimeout(input, init) {
      var signal = init && init.signal;
      if (!signal || !pending.has(signal)) return nativeFetch.apply(this, arguments);
      var delay = pending.get(signal), options = {}, key, caller = this;
      for (key in init) if (Object.prototype.hasOwnProperty.call(init, key) && key !== 'signal') options[key] = init[key];
      return new root.Promise(function (resolve, reject) {
        var settled = false, cancel;
        function finish(ok, result) { if (settled) return; settled = true; cancel(); (ok ? resolve : reject)(result); }
        cancel = later(function () { finish(false, timeoutError()); }, delay);
        try { root.Promise.resolve(nativeFetch.call(caller, input, options)).then(function (value) { finish(true, value); }, function (error) { finish(false, error); }); }
        catch (error) { finish(false, error); }
      });
    };
    installed.push('fetch timeout fallback'); timeoutMode = 'fetch-race';
  }

  root.CITADEL_COMPAT = Object.freeze({ version: '1.7.1', installed: Object.freeze(installed.slice()), timeoutMode: timeoutMode || 'unavailable' });
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
