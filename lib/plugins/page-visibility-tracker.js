/**
 * Copyright 2016 Google Inc. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


var defaults = require('../utilities').defaults;
var isObject = require('../utilities').isObject;
var provide = require('../provide');


var DEFAULT_SESSION_TIMEOUT = 30; // 30 minutes.


/**
 * Registers outbound link tracking on tracker object.
 * @constructor
 * @param {Object} tracker Passed internally by analytics.js
 * @param {?Object} opts Passed by the require command.
 */
function PageVisibilityTracker(tracker, opts) {

  // Feature detects to prevent errors in unsupporting browsers.
  if (!window.addEventListener) return;

  this.opts = defaults(opts, {
    sessionTimeout: DEFAULT_SESSION_TIMEOUT,
    virtualPageviewFields: {},
  });

  this.tracker = tracker;

  // Binds methods to `this`.
  this.handleVisibilityStateChange = this.handleVisibilityStateChange.bind(this);


  this.overrideTrackerSendMethod();
  this.overrideTrackerSendHitTask();

  document.addEventListener(
      'visibilitychange', this.handleVisibilityStateChange);
}


/**
 * Handles changes to `document.visibilityState`.
 */
PageVisibilityTracker.prototype.handleVisibilityStateChange = function() {
  var visibilityState = document.visibilityState;

  if (this.sessionHasTimedOut()) {
    // Prevents sending 'hidden' state hits when the session has timed out.
    if (visibilityState == 'hidden') return;

    if (visibilityState == 'visible') {
      // If the session has timed out, a transition to "visible" should be
      // considered a new pageview and a new session.
      this.tracker.send('pageview', this.opts.virtualPageviewFields);
    }
  }
  else {
    this.tracker.send('event', {
      eventCategory: 'Page Visibility',
      eventAction: 'change',
      eventLabel: document.visibilityState,
      transport: 'beacon'
    });
  }
};


/**
 * Returns true if the session has not timed out. A session timeout occurs when
 * more than `this.opts.sessionTimeout` minutes has elapsed since the
 * tracker sent the previous hit.
 * @return {boolean} True if the session has timed out.
 */
PageVisibilityTracker.prototype.sessionHasTimedOut = function() {
  var minutesSinceLastHit = (new Date - this.lastHitTime) / (60 * 1000);
  return this.opts.sessionTimeout < minutesSinceLastHit;
}


/**
 * Overrides the `tracker.send` method to send a pageview hit before the
 * current hit being sent if the session has timed out and the current hit is
 * not a pageview itself.
 */
PageVisibilityTracker.prototype.overrideTrackerSendMethod = function() {
  this.originalTrackerSendMethod = this.tracker.send;

  this.tracker.send = function() {
    var args = Array.prototype.slice.call(arguments);
    var firstArg = args[0];
    var hitType = isObject(firstArg) ? firstArg.hitType : firstArg;
    var isPageview = hitType == 'pageview';

    if (!isPageview && this.sessionHasTimedOut()) {
      this.originalTrackerSendMethod.call(this.tracker,
          'pageview', this.opts.virtualPageviewFields);
    }

    this.originalTrackerSendMethod.apply(this.tracker, args);
  }.bind(this);
};


/**
 * Overrides the tracker's `sendHitTask` to record the time of the previous
 * hit. This is used to determine whether or not a session has timed out.
 */
PageVisibilityTracker.prototype.overrideTrackerSendHitTask = function() {
  this.originalTrackerSendHitTask = this.tracker.get('sendHitTask');
  this.lastHitTime = +new Date;

  this.tracker.set('sendHitTask', function(model) {
    this.originalTrackerSendHitTask(model);
    this.lastHitTime = +new Date;
  }.bind(this));
}


/**
 * Removes all event listeners and instance properties.
 */
 PageVisibilityTracker.prototype.remove = function() {
  this.tracker.set('sendHitTask', this.originalTrackerSendHitTask);
  this.tracker.send = this.originalTrackerSendMethod;

  document.removeEventListener(
      'visibilitychange', this.handleVisibilityStateChange);

  this.tracker = null;
  this.opts = null;

  this.originalTrackerSendHitTask = null;
  this.originalTrackerSendMethod = null;
  this.handleVisibilityStateChange = null;
  this.lastHitTime = null;
};


provide('pageVisibilityTracker', PageVisibilityTracker);