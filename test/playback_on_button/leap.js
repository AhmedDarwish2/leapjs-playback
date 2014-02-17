!function(e, t, n) {
    function i(n, s) {
        if (!t[n]) {
            if (!e[n]) {
                var o = typeof require == "function" && require;
                if (!s && o)
                    return o(n, !0);
                if (r)
                    return r(n, !0);
                throw new Error("Cannot find module '" + n + "'")
            }
            var u = t[n] = {exports: {}};
            e[n][0].call(u.exports, function(t) {
                var r = e[n][1][t];
                return i(r ? r : t)
            }, u, u.exports)
        }
        return t[n].exports
    }
    var r = typeof require == "function" && require;
    for (var s = 0; s < n.length; s++)
        i(n[s]);
    return i
}({1: [function(require, module, exports) {
    var CircularBuffer = module.exports = function(size) {
        this.pos = 0;
        this._buf = [];
        this.size = size
    };
    CircularBuffer.prototype.get = function(i) {
        if (i == undefined)
            i = 0;
        if (i >= this.size)
            return undefined;
        if (i >= this._buf.length)
            return undefined;
        return this._buf[(this.pos - i - 1) % this.size]
    };
    CircularBuffer.prototype.push = function(o) {
        this._buf[this.pos % this.size] = o;
        return this.pos++
    }
}, {}],2: [function(require, module, exports) {
    var chooseProtocol = require("../protocol").chooseProtocol, EventEmitter = require("events").EventEmitter, _ = require("underscore");
    var BaseConnection = module.exports = function(opts) {
        this.opts = _.defaults(opts || {}, {host: "127.0.0.1",enableGestures: false,port: 6437,background: false,requestProtocolVersion: 5});
        this.host = this.opts.host;
        this.port = this.opts.port;
        this.on("ready", function() {
            this.enableGestures(this.opts.enableGestures);
            this.setBackground(this.opts.background)
        })
    };
    BaseConnection.prototype.getUrl = function() {
        return "ws://" + this.host + ":" + this.port + "/v" + this.opts.requestProtocolVersion + ".json"
    };
    BaseConnection.prototype.setBackground = function(state) {
        this.opts.background = state;
        if (this.protocol && this.protocol.sendBackground && this.background !== this.opts.background) {
            this.background = this.opts.background;
            this.protocol.sendBackground(this, this.opts.background)
        }
    };
    BaseConnection.prototype.handleOpen = function() {
        if (!this.connected) {
            this.connected = true;
            this.emit("connect")
        }
    };
    BaseConnection.prototype.enableGestures = function(enabled) {
        this.gesturesEnabled = enabled ? true : false;
        this.send(this.protocol.encode({enableGestures: this.gesturesEnabled}))
    };
    BaseConnection.prototype.handleClose = function(code, reason) {
        if (!this.connected)
            return;
        this.disconnect();
        if (code === 1001 && this.opts.requestProtocolVersion > 1) {
            this.opts.requestProtocolVersion--
        }
        this.startReconnection()
    };
    BaseConnection.prototype.startReconnection = function() {
        var connection = this;
        this.reconnectionTimer = setInterval(function() {
            connection.reconnect()
        }, 1e3)
    };
    BaseConnection.prototype.disconnect = function() {
        if (!this.socket)
            return;
        this.socket.close();
        delete this.socket;
        delete this.protocol;
        if (this.connected) {
            this.connected = false;
            this.emit("disconnect")
        }
        return true
    };
    BaseConnection.prototype.reconnect = function() {
        if (this.connected) {
            clearInterval(this.reconnectionTimer)
        } else {
            this.disconnect();
            this.connect()
        }
    };
    BaseConnection.prototype.handleData = function(data) {
        var message = JSON.parse(data);
        var messageEvent;
        if (this.protocol === undefined) {
            messageEvent = this.protocol = chooseProtocol(message);
            this.emit("ready")
        } else {
            messageEvent = this.protocol(message)
        }
        this.emit(messageEvent.type, messageEvent)
    };
    BaseConnection.prototype.connect = function() {
        if (this.socket)
            return;
        this.socket = this.setupSocket();
        return true
    };
    BaseConnection.prototype.send = function(data) {
        this.socket.send(data)
    };
    BaseConnection.prototype.reportFocus = function(state) {
        if (this.focusedState === state)
            return;
        this.focusedState = state;
        this.emit(this.focusedState ? "focus" : "blur");
        if (this.protocol && this.protocol.sendFocused) {
            this.protocol.sendFocused(this, this.focusedState)
        }
    };
    _.extend(BaseConnection.prototype, EventEmitter.prototype)
}, {"../protocol": 14,events: 18,underscore: 21}],3: [function(require, module, exports) {
    var BaseConnection = module.exports = require("./base"), _ = require("underscore");
    var BrowserConnection = module.exports = function(opts) {
        BaseConnection.call(this, opts);
        var connection = this;
        this.on("ready", function() {
            connection.startFocusLoop()
        });
        this.on("disconnect", function() {
            connection.stopFocusLoop()
        })
    };
    _.extend(BrowserConnection.prototype, BaseConnection.prototype);
    BrowserConnection.prototype.setupSocket = function() {
        var connection = this;
        var socket = new WebSocket(this.getUrl());
        socket.onopen = function() {
            connection.handleOpen()
        };
        socket.onclose = function(data) {
            connection.handleClose(data["code"], data["reason"])
        };
        socket.onmessage = function(message) {
            connection.handleData(message.data)
        };
        return socket
    };
    BrowserConnection.prototype.startFocusLoop = function() {
        if (this.focusDetectorTimer)
            return;
        var connection = this;
        var propertyName = null;
        if (typeof document.hidden !== "undefined") {
            propertyName = "hidden"
        } else if (typeof document.mozHidden !== "undefined") {
            propertyName = "mozHidden"
        } else if (typeof document.msHidden !== "undefined") {
            propertyName = "msHidden"
        } else if (typeof document.webkitHidden !== "undefined") {
            propertyName = "webkitHidden"
        } else {
            propertyName = undefined
        }
        if (connection.windowVisible === undefined) {
            connection.windowVisible = propertyName === undefined ? true : document[propertyName] === false
        }
        var focusListener = window.addEventListener("focus", function(e) {
            connection.windowVisible = true;
            updateFocusState()
        });
        var blurListener = window.addEventListener("blur", function(e) {
            connection.windowVisible = false;
            updateFocusState()
        });
        this.on("disconnect", function() {
            window.removeEventListener("focus", focusListener);
            window.removeEventListener("blur", blurListener)
        });
        var updateFocusState = function() {
            var isVisible = propertyName === undefined ? true : document[propertyName] === false;
            connection.reportFocus(isVisible && connection.windowVisible)
        };
        this.focusDetectorTimer = setInterval(updateFocusState, 100)
    };
    BrowserConnection.prototype.stopFocusLoop = function() {
        if (!this.focusDetectorTimer)
            return;
        clearTimeout(this.focusDetectorTimer);
        delete this.focusDetectorTimer
    }
}, {"./base": 2,underscore: 21}],4: [function(require, module, exports) {
    var WebSocket = require("ws"), BaseConnection = require("./base"), _ = require("underscore");
    var NodeConnection = module.exports = function(opts) {
        BaseConnection.call(this, opts)
    };
    _.extend(NodeConnection.prototype, BaseConnection.prototype);
    NodeConnection.prototype.setupSocket = function() {
        var connection = this;
        var socket = new WebSocket(this.getUrl());
        socket.on("open", function() {
            connection.handleOpen()
        });
        socket.on("message", function(m) {
            connection.handleData(m)
        });
        socket.on("close", function(code, reason) {
            connection.handleClose(code, reason)
        });
        socket.on("error", function() {
            connection.startReconnection()
        });
        return socket
    }
}, {"./base": 2,underscore: 21,ws: 22}],5: [function(require, module, exports) {
    var process = require("__browserify_process");
    var Frame = require("./frame"), CircularBuffer = require("./circular_buffer"), Pipeline = require("./pipeline"), EventEmitter = require("events").EventEmitter, gestureListener = require("./gesture").gestureListener, _ = require("underscore");
    var Controller = module.exports = function(opts) {
        var inNode = typeof process !== "undefined" && process.title === "node";
        opts = _.defaults(opts || {}, {inNode: inNode});
        this.inNode = opts.inNode;
        opts = _.defaults(opts || {}, {frameEventName: this.useAnimationLoop() ? "animationFrame" : "deviceFrame",suppressAnimationLoop: false});
        this.suppressAnimationLoop = opts.suppressAnimationLoop;
        this.frameEventName = opts.frameEventName;
        this.history = new CircularBuffer(200);
        this.lastFrame = Frame.Invalid;
        this.lastValidFrame = Frame.Invalid;
        this.lastConnectionFrame = Frame.Invalid;
        this.accumulatedGestures = [];
        if (opts.connectionType === undefined) {
            this.connectionType = this.inBrowser() ? require("./connection/browser") : require("./connection/node")
        } else {
            this.connectionType = opts.connectionType
        }
        this.connection = new this.connectionType(opts);
        this.setupConnectionEvents()
    };
    Controller.prototype.gesture = function(type, cb) {
        var creator = gestureListener(this, type);
        if (cb !== undefined) {
            creator.stop(cb)
        }
        return creator
    };
    Controller.prototype.setBackground = function(state) {
        this.connection.setBackground(state)
    };
    Controller.prototype.inBrowser = function() {
        return !this.inNode
    };
    Controller.prototype.useAnimationLoop = function() {
        return this.inBrowser() && typeof chrome === "undefined"
    };
    Controller.prototype.connect = function() {
        var controller = this;
        if (this.connection.connect() && this.inBrowser() && !controller.suppressAnimationLoop) {
            var callback = function() {
                controller.emit("animationFrame", controller.lastConnectionFrame);
                window.requestAnimationFrame(callback)
            };
            window.requestAnimationFrame(callback)
        }
    };
    Controller.prototype.disconnect = function() {
        this.connection.disconnect()
    };
    Controller.prototype.frame = function(num) {
        return this.history.get(num) || Frame.Invalid
    };
    Controller.prototype.loop = function(callback) {
        switch (callback.length) {
            case 1:
                this.on(this.frameEventName, callback);
                break;
            case 2:
                var controller = this;
                var scheduler = null;
                var immediateRunnerCallback = function(frame) {
                    callback(frame, function() {
                        if (controller.lastFrame != frame) {
                            immediateRunnerCallback(controller.lastFrame)
                        } else {
                            controller.once(controller.frameEventName, immediateRunnerCallback)
                        }
                    })
                };
                this.once(this.frameEventName, immediateRunnerCallback);
                break
        }
        this.connect()
    };
    Controller.prototype.addStep = function(step) {
        if (!this.pipeline)
            this.pipeline = new Pipeline(this);
        this.pipeline.addStep(step)
    };
    Controller.prototype.processFrame = function(frame) {
        if (frame.gestures) {
            this.accumulatedGestures = this.accumulatedGestures.concat(frame.gestures)
        }
        if (this.pipeline) {
            frame = this.pipeline.run(frame);
            if (!frame)
                frame = Frame.Invalid
        }
        this.lastConnectionFrame = frame;
        this.emit("deviceFrame", frame)
    };
    Controller.prototype.processFinishedFrame = function(frame) {
        this.lastFrame = frame;
        if (frame.valid) {
            this.lastValidFrame = frame
        }
        frame.controller = this;
        frame.historyIdx = this.history.push(frame);
        if (frame.gestures) {
            frame.gestures = this.accumulatedGestures;
            this.accumulatedGestures = [];
            for (var gestureIdx = 0; gestureIdx != frame.gestures.length; gestureIdx++) {
                this.emit("gesture", frame.gestures[gestureIdx], frame)
            }
        }
        this.emit("frame", frame)
    };
    Controller.prototype.setupConnectionEvents = function() {
        var controller = this;
        this.connection.on("frame", function(frame) {
            controller.processFrame(frame)
        });
        this.on(this.frameEventName, function(frame) {
            controller.processFinishedFrame(frame)
        });
        this.connection.on("disconnect", function() {
            controller.emit("disconnect")
        });
        this.connection.on("ready", function() {
            controller.emit("ready")
        });
        this.connection.on("connect", function() {
            controller.emit("connect")
        });
        this.connection.on("focus", function() {
            controller.emit("focus")
        });
        this.connection.on("blur", function() {
            controller.emit("blur")
        });
        this.connection.on("protocol", function(protocol) {
            controller.emit("protocol", protocol)
        });
        this.connection.on("deviceConnect", function(evt) {
            controller.emit(evt.state ? "deviceConnected" : "deviceDisconnected")
        })
    };
    _.extend(Controller.prototype, EventEmitter.prototype)
}, {"./circular_buffer": 1,"./connection/browser": 3,"./connection/node": 4,"./frame": 7,"./gesture": 8,"./pipeline": 12,__browserify_process: 19,events: 18,underscore: 21}],6: [function(require, module, exports) {
    var Pointable = require("./pointable"), _ = require("underscore");
    var Finger = module.exports = function(data) {
        Pointable.call(this, data);
        this.dipPosition = data.dipPosition;
        this.pipPosition = data.pipPosition;
        this.mcpPosition = data.mcpPosition;
        this.extended = data.extended;
        this.type = data.type;
        this.finger = true;
        this.positions = [this.mcpPosition, this.pipPosition, this.dipPosition, this.tipPosition]
    };
    _.extend(Finger.prototype, Pointable.prototype);
    Finger.prototype.toString = function() {
        if (this.tool == true) {
            return "Finger [ id:" + this.id + " " + this.length + "mmx | width:" + this.width + "mm | direction:" + this.direction + " ]"
        } else {
            return "Finger [ id:" + this.id + " " + this.length + "mmx | direction: " + this.direction + " ]"
        }
    };
    Finger.Invalid = {valid: false}
}, {"./pointable": 13,underscore: 21}],7: [function(require, module, exports) {
    var Hand = require("./hand"), Pointable = require("./pointable"), createGesture = require("./gesture").createGesture, glMatrix = require("gl-matrix"), mat3 = glMatrix.mat3, vec3 = glMatrix.vec3, InteractionBox = require("./interaction_box"), _ = require("underscore");
    var Frame = module.exports = function(data) {
        this.valid = true;
        this.id = data.id;
        this.timestamp = data.timestamp;
        this.hands = [];
        this.handsMap = {};
        this.pointables = [];
        this.tools = [];
        this.fingers = [];
        if (data.interactionBox) {
            this.interactionBox = new InteractionBox(data.interactionBox)
        }
        this.gestures = [];
        this.pointablesMap = {};
        this._translation = data.t;
        this._rotation = _.flatten(data.r);
        this._scaleFactor = data.s;
        this.data = data;
        this.type = "frame";
        this.currentFrameRate = data.currentFrameRate;
        if (data.gestures) {
            for (var gestureIdx = 0, gestureCount = data.gestures.length; gestureIdx != gestureCount; gestureIdx++) {
                this.gestures.push(createGesture(data.gestures[gestureIdx]))
            }
        }
    };
    Frame.prototype.tool = function(id) {
        var pointable = this.pointable(id);
        return pointable.tool ? pointable : Pointable.Invalid
    };
    Frame.prototype.pointable = function(id) {
        return this.pointablesMap[id] || Pointable.Invalid
    };
    Frame.prototype.finger = function(id) {
        var pointable = this.pointable(id);
        return !pointable.tool ? pointable : Pointable.Invalid
    };
    Frame.prototype.hand = function(id) {
        return this.handsMap[id] || Hand.Invalid
    };
    Frame.prototype.rotationAngle = function(sinceFrame, axis) {
        if (!this.valid || !sinceFrame.valid)
            return 0;
        var rot = this.rotationMatrix(sinceFrame);
        var cs = (rot[0] + rot[4] + rot[8] - 1) * .5;
        var angle = Math.acos(cs);
        angle = isNaN(angle) ? 0 : angle;
        if (axis !== undefined) {
            var rotAxis = this.rotationAxis(sinceFrame);
            angle *= vec3.dot(rotAxis, vec3.normalize(vec3.create(), axis))
        }
        return angle
    };
    Frame.prototype.rotationAxis = function(sinceFrame) {
        if (!this.valid || !sinceFrame.valid)
            return vec3.create();
        return vec3.normalize(vec3.create(), [this._rotation[7] - sinceFrame._rotation[5], this._rotation[2] - sinceFrame._rotation[6], this._rotation[3] - sinceFrame._rotation[1]])
    };
    Frame.prototype.rotationMatrix = function(sinceFrame) {
        if (!this.valid || !sinceFrame.valid)
            return mat3.create();
        var transpose = mat3.transpose(mat3.create(), this._rotation);
        return mat3.multiply(mat3.create(), sinceFrame._rotation, transpose)
    };
    Frame.prototype.scaleFactor = function(sinceFrame) {
        if (!this.valid || !sinceFrame.valid)
            return 1;
        return Math.exp(this._scaleFactor - sinceFrame._scaleFactor)
    };
    Frame.prototype.translation = function(sinceFrame) {
        if (!this.valid || !sinceFrame.valid)
            return vec3.create();
        return vec3.subtract(vec3.create(), this._translation, sinceFrame._translation)
    };
    Frame.prototype.toString = function() {
        var str = "Frame [ id:" + this.id + " | timestamp:" + this.timestamp + " | Hand count:(" + this.hands.length + ") | Pointable count:(" + this.pointables.length + ")";
        if (this.gestures)
            str += " | Gesture count:(" + this.gestures.length + ")";
        str += " ]";
        return str
    };
    Frame.prototype.dump = function() {
        var out = "";
        out += "Frame Info:<br/>";
        out += this.toString();
        out += "<br/><br/>Hands:<br/>";
        for (var handIdx = 0, handCount = this.hands.length; handIdx != handCount; handIdx++) {
            out += "  " + this.hands[handIdx].toString() + "<br/>"
        }
        out += "<br/><br/>Pointables:<br/>";
        for (var pointableIdx = 0, pointableCount = this.pointables.length; pointableIdx != pointableCount; pointableIdx++) {
            out += "  " + this.pointables[pointableIdx].toString() + "<br/>"
        }
        if (this.gestures) {
            out += "<br/><br/>Gestures:<br/>";
            for (var gestureIdx = 0, gestureCount = this.gestures.length; gestureIdx != gestureCount; gestureIdx++) {
                out += "  " + this.gestures[gestureIdx].toString() + "<br/>"
            }
        }
        out += "<br/><br/>Raw JSON:<br/>";
        out += JSON.stringify(this.data);
        return out
    };
    Frame.Invalid = {valid: false,hands: [],fingers: [],tools: [],gestures: [],pointables: [],pointable: function() {
        return Pointable.Invalid
    },finger: function() {
        return Pointable.Invalid
    },hand: function() {
        return Hand.Invalid
    },toString: function() {
        return "invalid frame"
    },dump: function() {
        return this.toString()
    },rotationAngle: function() {
        return 0
    },rotationMatrix: function() {
        return mat3.create()
    },rotationAxis: function() {
        return vec3.create()
    },scaleFactor: function() {
        return 1
    },translation: function() {
        return vec3.create()
    }}
}, {"./gesture": 8,"./hand": 9,"./interaction_box": 11,"./pointable": 13,"gl-matrix": 20,underscore: 21}],8: [function(require, module, exports) {
    var glMatrix = require("gl-matrix"), vec3 = glMatrix.vec3, EventEmitter = require("events").EventEmitter, _ = require("underscore");
    var createGesture = exports.createGesture = function(data) {
        var gesture;
        switch (data.type) {
            case "circle":
                gesture = new CircleGesture(data);
                break;
            case "swipe":
                gesture = new SwipeGesture(data);
                break;
            case "screenTap":
                gesture = new ScreenTapGesture(data);
                break;
            case "keyTap":
                gesture = new KeyTapGesture(data);
                break;
            default:
                throw "unkown gesture type"
        }
        gesture.id = data.id;
        gesture.handIds = data.handIds;
        gesture.pointableIds = data.pointableIds;
        gesture.duration = data.duration;
        gesture.state = data.state;
        gesture.type = data.type;
        return gesture
    };
    var gestureListener = exports.gestureListener = function(controller, type) {
        var handlers = {};
        var gestureMap = {};
        var gestureCreator = function() {
            var candidateGesture = gestureMap[gesture.id];
            if (candidateGesture !== undefined)
                gesture.update(gesture, frame);
            if (gesture.state == "start" || gesture.state == "stop") {
                if (type == gesture.type && gestureMap[gesture.id] === undefined) {
                    gestureMap[gesture.id] = new Gesture(gesture, frame);
                    gesture.update(gesture, frame)
                }
                if (gesture.state == "stop") {
                    delete gestureMap[gesture.id]
                }
            }
        };
        controller.on("gesture", function(gesture, frame) {
            if (gesture.type == type) {
                if (gesture.state == "start" || gesture.state == "stop") {
                    if (gestureMap[gesture.id] === undefined) {
                        var gestureTracker = new Gesture(gesture, frame);
                        gestureMap[gesture.id] = gestureTracker;
                        _.each(handlers, function(cb, name) {
                            gestureTracker.on(name, cb)
                        })
                    }
                }
                gestureMap[gesture.id].update(gesture, frame);
                if (gesture.state == "stop") {
                    delete gestureMap[gesture.id]
                }
            }
        });
        var builder = {start: function(cb) {
            handlers["start"] = cb;
            return builder
        },stop: function(cb) {
            handlers["stop"] = cb;
            return builder
        },complete: function(cb) {
            handlers["stop"] = cb;
            return builder
        },update: function(cb) {
            handlers["update"] = cb;
            return builder
        }};
        return builder
    };
    var Gesture = exports.Gesture = function(gesture, frame) {
        this.gestures = [gesture];
        this.frames = [frame]
    };
    Gesture.prototype.update = function(gesture, frame) {
        this.lastGesture = gesture;
        this.lastFrame = frame;
        this.gestures.push(gesture);
        this.frames.push(frame);
        this.emit(gesture.state, this)
    };
    Gesture.prototype.translation = function() {
        return vec3.subtract(vec3.create(), this.lastGesture.startPosition, this.lastGesture.position)
    };
    _.extend(Gesture.prototype, EventEmitter.prototype);
    var CircleGesture = function(data) {
        this.center = data.center;
        this.normal = data.normal;
        this.progress = data.progress;
        this.radius = data.radius
    };
    CircleGesture.prototype.toString = function() {
        return "CircleGesture [" + JSON.stringify(this) + "]"
    };
    var SwipeGesture = function(data) {
        this.startPosition = data.startPosition;
        this.position = data.position;
        this.direction = data.direction;
        this.speed = data.speed
    };
    SwipeGesture.prototype.toString = function() {
        return "SwipeGesture [" + JSON.stringify(this) + "]"
    };
    var ScreenTapGesture = function(data) {
        this.position = data.position;
        this.direction = data.direction;
        this.progress = data.progress
    };
    ScreenTapGesture.prototype.toString = function() {
        return "ScreenTapGesture [" + JSON.stringify(this) + "]"
    };
    var KeyTapGesture = function(data) {
        this.position = data.position;
        this.direction = data.direction;
        this.progress = data.progress
    };
    KeyTapGesture.prototype.toString = function() {
        return "KeyTapGesture [" + JSON.stringify(this) + "]"
    }
}, {events: 18,"gl-matrix": 20,underscore: 21}],9: [function(require, module, exports) {
    var Pointable = require("./pointable"), glMatrix = require("gl-matrix"), mat3 = glMatrix.mat3, vec3 = glMatrix.vec3, _ = require("underscore");
    var Hand = module.exports = function(data) {
        this.id = data.id;
        this.palmPosition = data.palmPosition;
        this.direction = data.direction;
        this.palmVelocity = data.palmVelocity;
        this.palmNormal = data.palmNormal;
        this.sphereCenter = data.sphereCenter;
        this.sphereRadius = data.sphereRadius;
        this.valid = true;
        this.pointables = [];
        this.fingers = [];
        this.tools = [];
        this._translation = data.t;
        this._rotation = _.flatten(data.r);
        this._scaleFactor = data.s;
        this.timeVisible = data.timeVisible;
        this.stabilizedPalmPosition = data.stabilizedPalmPosition;
        this.type = data.type;
        this.grabStrength = data.grabStrength;
        this.pinchStrength = data.pinchStrength
    };
    Hand.prototype.finger = function(id) {
        var finger = this.frame.finger(id);
        return finger && finger.handId == this.id ? finger : Pointable.Invalid
    };
    Hand.prototype.rotationAngle = function(sinceFrame, axis) {
        if (!this.valid || !sinceFrame.valid)
            return 0;
        var sinceHand = sinceFrame.hand(this.id);
        if (!sinceHand.valid)
            return 0;
        var rot = this.rotationMatrix(sinceFrame);
        var cs = (rot[0] + rot[4] + rot[8] - 1) * .5;
        var angle = Math.acos(cs);
        angle = isNaN(angle) ? 0 : angle;
        if (axis !== undefined) {
            var rotAxis = this.rotationAxis(sinceFrame);
            angle *= vec3.dot(rotAxis, vec3.normalize(vec3.create(), axis))
        }
        return angle
    };
    Hand.prototype.rotationAxis = function(sinceFrame) {
        if (!this.valid || !sinceFrame.valid)
            return vec3.create();
        var sinceHand = sinceFrame.hand(this.id);
        if (!sinceHand.valid)
            return vec3.create();
        return vec3.normalize(vec3.create(), [this._rotation[7] - sinceHand._rotation[5], this._rotation[2] - sinceHand._rotation[6], this._rotation[3] - sinceHand._rotation[1]])
    };
    Hand.prototype.rotationMatrix = function(sinceFrame) {
        if (!this.valid || !sinceFrame.valid)
            return mat3.create();
        var sinceHand = sinceFrame.hand(this.id);
        if (!sinceHand.valid)
            return mat3.create();
        var transpose = mat3.transpose(mat3.create(), this._rotation);
        var m = mat3.multiply(mat3.create(), sinceHand._rotation, transpose);
        return m
    };
    Hand.prototype.scaleFactor = function(sinceFrame) {
        if (!this.valid || !sinceFrame.valid)
            return 1;
        var sinceHand = sinceFrame.hand(this.id);
        if (!sinceHand.valid)
            return 1;
        return Math.exp(this._scaleFactor - sinceHand._scaleFactor)
    };
    Hand.prototype.translation = function(sinceFrame) {
        if (!this.valid || !sinceFrame.valid)
            return vec3.create();
        var sinceHand = sinceFrame.hand(this.id);
        if (!sinceHand.valid)
            return vec3.create();
        return [this._translation[0] - sinceHand._translation[0], this._translation[1] - sinceHand._translation[1], this._translation[2] - sinceHand._translation[2]]
    };
    Hand.prototype.toString = function() {
        return "Hand (" + this.type + ") [ id: " + this.id + " | palm velocity:" + this.palmVelocity + " | sphere center:" + this.sphereCenter + " ] "
    };
    Hand.prototype.pitch = function() {
        return Math.atan2(this.direction[1], -this.direction[2])
    };
    Hand.prototype.yaw = function() {
        return Math.atan2(this.direction[0], -this.direction[2])
    };
    Hand.prototype.roll = function() {
        return Math.atan2(this.palmNormal[0], -this.palmNormal[1])
    };
    Hand.Invalid = {valid: false,fingers: [],tools: [],pointables: [],left: false,pointable: function() {
        return Pointable.Invalid
    },finger: function() {
        return Pointable.Invalid
    },toString: function() {
        return "invalid frame"
    },dump: function() {
        return this.toString()
    },rotationAngle: function() {
        return 0
    },rotationMatrix: function() {
        return mat3.create()
    },rotationAxis: function() {
        return vec3.create()
    },scaleFactor: function() {
        return 1
    },translation: function() {
        return vec3.create()
    }}
}, {"./pointable": 13,"gl-matrix": 20,underscore: 21}],10: [function(require, module, exports) {
    module.exports = {Controller: require("./controller"),Frame: require("./frame"),Gesture: require("./gesture"),Hand: require("./hand"),Pointable: require("./pointable"),InteractionBox: require("./interaction_box"),CircularBuffer: require("./circular_buffer"),UI: require("./ui"),JSONProtocol: require("./protocol").JSONProtocol,glMatrix: require("gl-matrix"),mat3: require("gl-matrix").mat3,vec3: require("gl-matrix").vec3,loopController: undefined,loop: function(opts, callback) {
        if (callback === undefined) {
            callback = opts;
            opts = {}
        }
        if (!this.loopController)
            this.loopController = new this.Controller(opts);
        this.loopController.loop(callback);
        return this.loopController
    }}
}, {"./circular_buffer": 1,"./controller": 5,"./frame": 7,"./gesture": 8,"./hand": 9,"./interaction_box": 11,"./pointable": 13,"./protocol": 14,"./ui": 15,"gl-matrix": 20}],11: [function(require, module, exports) {
    var glMatrix = require("gl-matrix"), vec3 = glMatrix.vec3;
    var InteractionBox = module.exports = function(data) {
        this.valid = true;
        this.center = data.center;
        this.size = data.size;
        this.width = data.size[0];
        this.height = data.size[1];
        this.depth = data.size[2]
    };
    InteractionBox.prototype.denormalizePoint = function(normalizedPosition) {
        return vec3.fromValues((normalizedPosition[0] - .5) * this.size[0] + this.center[0], (normalizedPosition[1] - .5) * this.size[1] + this.center[1], (normalizedPosition[2] - .5) * this.size[2] + this.center[2])
    };
    InteractionBox.prototype.normalizePoint = function(position, clamp) {
        var vec = vec3.fromValues((position[0] - this.center[0]) / this.size[0] + .5, (position[1] - this.center[1]) / this.size[1] + .5, (position[2] - this.center[2]) / this.size[2] + .5);
        if (clamp) {
            vec[0] = Math.min(Math.max(vec[0], 0), 1);
            vec[1] = Math.min(Math.max(vec[1], 0), 1);
            vec[2] = Math.min(Math.max(vec[2], 0), 1)
        }
        return vec
    };
    InteractionBox.prototype.toString = function() {
        return "InteractionBox [ width:" + this.width + " | height:" + this.height + " | depth:" + this.depth + " ]"
    };
    InteractionBox.Invalid = {valid: false}
}, {"gl-matrix": 20}],12: [function(require, module, exports) {
    var Pipeline = module.exports = function() {
        this.steps = []
    };
    Pipeline.prototype.addStep = function(step) {
        this.steps.push(step)
    };
    Pipeline.prototype.run = function(frame) {
        var stepsLength = this.steps.length;
        for (var i = 0; i != stepsLength; i++) {
            if (!frame)
                break;
            frame = this.steps[i](frame)
        }
        return frame
    }
}, {}],13: [function(require, module, exports) {
    var glMatrix = require("gl-matrix"), vec3 = glMatrix.vec3;
    var Pointable = module.exports = function(data) {
        this.valid = true;
        this.id = data.id;
        this.handId = data.handId;
        this.length = data.length;
        this.tool = data.tool;
        this.width = data.width;
        this.direction = data.direction;
        this.stabilizedTipPosition = data.stabilizedTipPosition;
        this.tipPosition = data.tipPosition;
        this.tipVelocity = data.tipVelocity;
        this.touchZone = data.touchZone;
        this.touchDistance = data.touchDistance;
        this.timeVisible = data.timeVisible
    };
    Pointable.prototype.toString = function() {
        return "Pointable [ id:" + this.id + " " + this.length + "mmx | width:" + this.width + "mm | direction:" + this.direction + " ]"
    };
    Pointable.Invalid = {valid: false}
}, {"gl-matrix": 20}],14: [function(require, module, exports) {
    var Frame = require("./frame"), Hand = require("./hand"), Pointable = require("./pointable"), Finger = require("./finger");
    var Event = function(data) {
        this.type = data.type;
        this.state = data.state
    };
    var chooseProtocol = exports.chooseProtocol = function(header) {
        var protocol;
        switch (header.version) {
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
                protocol = JSONProtocol(header.version, function(data) {
                    return data.event ? new Event(data.event) : new Frame(data)
                });
                protocol.sendBackground = function(connection, state) {
                    connection.send(protocol.encode({background: state}))
                };
                protocol.sendFocused = function(connection, state) {
                    connection.send(protocol.encode({focused: state}))
                };
                break;
            default:
                throw "unrecognized version"
        }
        return protocol
    };
    var JSONProtocol = exports.JSONProtocol = function(version) {
        var protocol = function(data) {
            if (data.event) {
                return new Event(data.event)
            } else {
                var frame = new Frame(data);
                var handMap = {};
                for (var handIdx = 0, handCount = data.hands.length; handIdx != handCount; handIdx++) {
                    var hand = new Hand(data.hands[handIdx]);
                    hand.frame = frame;
                    frame.hands.push(hand);
                    frame.handsMap[hand.id] = hand;
                    handMap[hand.id] = handIdx
                }
                for (var pointableIdx = 0, pointableCount = data.pointables.length; pointableIdx != pointableCount; pointableIdx++) {
                    var pointableData = data.pointables[pointableIdx];
                    var pointable = pointableData.dipPosition ? new Finger(pointableData) : new Pointable(pointableData);
                    pointable.frame = frame;
                    frame.pointables.push(pointable);
                    frame.pointablesMap[pointable.id] = pointable;
                    (pointable.tool ? frame.tools : frame.fingers).push(pointable);
                    if (pointable.handId !== undefined && handMap.hasOwnProperty(pointable.handId)) {
                        var hand = frame.hands[handMap[pointable.handId]];
                        hand.pointables.push(pointable);
                        (pointable.tool ? hand.tools : hand.fingers).push(pointable)
                    }
                }
                return frame
            }
        };
        protocol.encode = function(message) {
            return JSON.stringify(message)
        };
        protocol.version = version;
        protocol.versionLong = "Version " + version;
        protocol.type = "protocol";
        return protocol
    }
}, {"./finger": 6,"./frame": 7,"./hand": 9,"./pointable": 13}],15: [function(require, module, exports) {
    exports.UI = {Region: require("./ui/region"),Cursor: require("./ui/cursor")}
}, {"./ui/cursor": 16,"./ui/region": 17}],16: [function(require, module, exports) {
    var Cursor = module.exports = function() {
        return function(frame) {
            var pointable = frame.pointables.sort(function(a, b) {
                return a.z - b.z
            })[0];
            if (pointable && pointable.valid) {
                frame.cursorPosition = pointable.tipPosition
            }
            return frame
        }
    }
}, {}],17: [function(require, module, exports) {
    var EventEmitter = require("events").EventEmitter, _ = require("underscore");
    var Region = module.exports = function(start, end) {
        this.start = new Vector(start);
        this.end = new Vector(end);
        this.enteredFrame = null
    };
    Region.prototype.hasPointables = function(frame) {
        for (var i = 0; i != frame.pointables.length; i++) {
            var position = frame.pointables[i].tipPosition;
            if (position.x >= this.start.x && position.x <= this.end.x && position.y >= this.start.y && position.y <= this.end.y && position.z >= this.start.z && position.z <= this.end.z) {
                return true
            }
        }
        return false
    };
    Region.prototype.listener = function(opts) {
        var region = this;
        if (opts && opts.nearThreshold)
            this.setupNearRegion(opts.nearThreshold);
        return function(frame) {
            return region.updatePosition(frame)
        }
    };
    Region.prototype.clipper = function() {
        var region = this;
        return function(frame) {
            region.updatePosition(frame);
            return region.enteredFrame ? frame : null
        }
    };
    Region.prototype.setupNearRegion = function(distance) {
        var nearRegion = this.nearRegion = new Region([this.start.x - distance, this.start.y - distance, this.start.z - distance], [this.end.x + distance, this.end.y + distance, this.end.z + distance]);
        var region = this;
        nearRegion.on("enter", function(frame) {
            region.emit("near", frame)
        });
        nearRegion.on("exit", function(frame) {
            region.emit("far", frame)
        });
        region.on("exit", function(frame) {
            region.emit("near", frame)
        })
    };
    Region.prototype.updatePosition = function(frame) {
        if (this.nearRegion)
            this.nearRegion.updatePosition(frame);
        if (this.hasPointables(frame) && this.enteredFrame == null) {
            this.enteredFrame = frame;
            this.emit("enter", this.enteredFrame)
        } else if (!this.hasPointables(frame) && this.enteredFrame != null) {
            this.enteredFrame = null;
            this.emit("exit", this.enteredFrame)
        }
        return frame
    };
    Region.prototype.normalize = function(position) {
        return new Vector([(position.x - this.start.x) / (this.end.x - this.start.x), (position.y - this.start.y) / (this.end.y - this.start.y), (position.z - this.start.z) / (this.end.z - this.start.z)])
    };
    Region.prototype.mapToXY = function(position, width, height) {
        var normalized = this.normalize(position);
        var x = normalized.x, y = normalized.y;
        if (x > 1)
            x = 1;
        else if (x < -1)
            x = -1;
        if (y > 1)
            y = 1;
        else if (y < -1)
            y = -1;
        return [(x + 1) / 2 * width, (1 - y) / 2 * height, normalized.z]
    };
    _.extend(Region.prototype, EventEmitter.prototype)
}, {events: 18,underscore: 21}],18: [function(require, module, exports) {
    var process = require("__browserify_process");
    if (!process.EventEmitter)
        process.EventEmitter = function() {
        };
    var EventEmitter = exports.EventEmitter = process.EventEmitter;
    var isArray = typeof Array.isArray === "function" ? Array.isArray : function(xs) {
        return Object.prototype.toString.call(xs) === "[object Array]"
    };
    function indexOf(xs, x) {
        if (xs.indexOf)
            return xs.indexOf(x);
        for (var i = 0; i < xs.length; i++) {
            if (x === xs[i])
                return i
        }
        return -1
    }
    var defaultMaxListeners = 10;
    EventEmitter.prototype.setMaxListeners = function(n) {
        if (!this._events)
            this._events = {};
        this._events.maxListeners = n
    };
    EventEmitter.prototype.emit = function(type) {
        if (type === "error") {
            if (!this._events || !this._events.error || isArray(this._events.error) && !this._events.error.length) {
                if (arguments[1] instanceof Error) {
                    throw arguments[1]
                } else {
                    throw new Error("Uncaught, unspecified 'error' event.")
                }
                return false
            }
        }
        if (!this._events)
            return false;
        var handler = this._events[type];
        if (!handler)
            return false;
        if (typeof handler == "function") {
            switch (arguments.length) {
                case 1:
                    handler.call(this);
                    break;
                case 2:
                    handler.call(this, arguments[1]);
                    break;
                case 3:
                    handler.call(this, arguments[1], arguments[2]);
                    break;
                default:
                    var args = Array.prototype.slice.call(arguments, 1);
                    handler.apply(this, args)
            }
            return true
        } else if (isArray(handler)) {
            var args = Array.prototype.slice.call(arguments, 1);
            var listeners = handler.slice();
            for (var i = 0, l = listeners.length; i < l; i++) {
                listeners[i].apply(this, args)
            }
            return true
        } else {
            return false
        }
    };
    EventEmitter.prototype.addListener = function(type, listener) {
        if ("function" !== typeof listener) {
            throw new Error("addListener only takes instances of Function")
        }
        if (!this._events)
            this._events = {};
        this.emit("newListener", type, listener);
        if (!this._events[type]) {
            this._events[type] = listener
        } else if (isArray(this._events[type])) {
            if (!this._events[type].warned) {
                var m;
                if (this._events.maxListeners !== undefined) {
                    m = this._events.maxListeners
                } else {
                    m = defaultMaxListeners
                }
                if (m && m > 0 && this._events[type].length > m) {
                    this._events[type].warned = true;
                    console.error("(node) warning: possible EventEmitter memory " + "leak detected. %d listeners added. " + "Use emitter.setMaxListeners() to increase limit.", this._events[type].length);
                    console.trace()
                }
            }
            this._events[type].push(listener)
        } else {
            this._events[type] = [this._events[type], listener]
        }
        return this
    };
    EventEmitter.prototype.on = EventEmitter.prototype.addListener;
    EventEmitter.prototype.once = function(type, listener) {
        var self = this;
        self.on(type, function g() {
            self.removeListener(type, g);
            listener.apply(this, arguments)
        });
        return this
    };
    EventEmitter.prototype.removeListener = function(type, listener) {
        if ("function" !== typeof listener) {
            throw new Error("removeListener only takes instances of Function")
        }
        if (!this._events || !this._events[type])
            return this;
        var list = this._events[type];
        if (isArray(list)) {
            var i = indexOf(list, listener);
            if (i < 0)
                return this;
            list.splice(i, 1);
            if (list.length == 0)
                delete this._events[type]
        } else if (this._events[type] === listener) {
            delete this._events[type]
        }
        return this
    };
    EventEmitter.prototype.removeAllListeners = function(type) {
        if (arguments.length === 0) {
            this._events = {};
            return this
        }
        if (type && this._events && this._events[type])
            this._events[type] = null;
        return this
    };
    EventEmitter.prototype.listeners = function(type) {
        if (!this._events)
            this._events = {};
        if (!this._events[type])
            this._events[type] = [];
        if (!isArray(this._events[type])) {
            this._events[type] = [this._events[type]]
        }
        return this._events[type]
    };
    EventEmitter.listenerCount = function(emitter, type) {
        var ret;
        if (!emitter._events || !emitter._events[type])
            ret = 0;
        else if (typeof emitter._events[type] === "function")
            ret = 1;
        else
            ret = emitter._events[type].length;
        return ret
    }
}, {__browserify_process: 19}],19: [function(require, module, exports) {
    var process = module.exports = {};
    process.nextTick = function() {
        var canSetImmediate = typeof window !== "undefined" && window.setImmediate;
        var canPost = typeof window !== "undefined" && window.postMessage && window.addEventListener;
        if (canSetImmediate) {
            return function(f) {
                return window.setImmediate(f)
            }
        }
        if (canPost) {
            var queue = [];
            window.addEventListener("message", function(ev) {
                var source = ev.source;
                if ((source === window || source === null) && ev.data === "process-tick") {
                    ev.stopPropagation();
                    if (queue.length > 0) {
                        var fn = queue.shift();
                        fn()
                    }
                }
            }, true);
            return function nextTick(fn) {
                queue.push(fn);
                window.postMessage("process-tick", "*")
            }
        }
        return function nextTick(fn) {
            setTimeout(fn, 0)
        }
    }();
    process.title = "browser";
    process.browser = true;
    process.env = {};
    process.argv = [];
    process.binding = function(name) {
        throw new Error("process.binding is not supported")
    };
    process.cwd = function() {
        return "/"
    };
    process.chdir = function(dir) {
        throw new Error("process.chdir is not supported")
    }
}, {}],20: [function(require, module, exports) {
    !function() {
        "use strict";
        var shim = {};
        if (typeof exports === "undefined") {
            if (typeof define == "function" && typeof define.amd == "object" && define.amd) {
                shim.exports = {};
                define(function() {
                    return shim.exports
                })
            } else {
                shim.exports = window
            }
        } else {
            shim.exports = exports
        }
        !function(exports) {
            var vec2 = {};
            if (!GLMAT_EPSILON) {
                var GLMAT_EPSILON = 1e-6
            }
            vec2.create = function() {
                return new Float32Array(2)
            };
            vec2.clone = function(a) {
                var out = new Float32Array(2);
                out[0] = a[0];
                out[1] = a[1];
                return out
            };
            vec2.fromValues = function(x, y) {
                var out = new Float32Array(2);
                out[0] = x;
                out[1] = y;
                return out
            };
            vec2.copy = function(out, a) {
                out[0] = a[0];
                out[1] = a[1];
                return out
            };
            vec2.set = function(out, x, y) {
                out[0] = x;
                out[1] = y;
                return out
            };
            vec2.add = function(out, a, b) {
                out[0] = a[0] + b[0];
                out[1] = a[1] + b[1];
                return out
            };
            vec2.sub = vec2.subtract = function(out, a, b) {
                out[0] = a[0] - b[0];
                out[1] = a[1] - b[1];
                return out
            };
            vec2.mul = vec2.multiply = function(out, a, b) {
                out[0] = a[0] * b[0];
                out[1] = a[1] * b[1];
                return out
            };
            vec2.div = vec2.divide = function(out, a, b) {
                out[0] = a[0] / b[0];
                out[1] = a[1] / b[1];
                return out
            };
            vec2.min = function(out, a, b) {
                out[0] = Math.min(a[0], b[0]);
                out[1] = Math.min(a[1], b[1]);
                return out
            };
            vec2.max = function(out, a, b) {
                out[0] = Math.max(a[0], b[0]);
                out[1] = Math.max(a[1], b[1]);
                return out
            };
            vec2.scale = function(out, a, b) {
                out[0] = a[0] * b;
                out[1] = a[1] * b;
                return out
            };
            vec2.dist = vec2.distance = function(a, b) {
                var x = b[0] - a[0], y = b[1] - a[1];
                return Math.sqrt(x * x + y * y)
            };
            vec2.sqrDist = vec2.squaredDistance = function(a, b) {
                var x = b[0] - a[0], y = b[1] - a[1];
                return x * x + y * y
            };
            vec2.len = vec2.length = function(a) {
                var x = a[0], y = a[1];
                return Math.sqrt(x * x + y * y)
            };
            vec2.sqrLen = vec2.squaredLength = function(a) {
                var x = a[0], y = a[1];
                return x * x + y * y
            };
            vec2.negate = function(out, a) {
                out[0] = -a[0];
                out[1] = -a[1];
                return out
            };
            vec2.normalize = function(out, a) {
                var x = a[0], y = a[1];
                var len = x * x + y * y;
                if (len > 0) {
                    len = 1 / Math.sqrt(len);
                    out[0] = a[0] * len;
                    out[1] = a[1] * len
                }
                return out
            };
            vec2.dot = function(a, b) {
                return a[0] * b[0] + a[1] * b[1]
            };
            vec2.cross = function(out, a, b) {
                var z = a[0] * b[1] - a[1] * b[0];
                out[0] = out[1] = 0;
                out[2] = z;
                return out
            };
            vec2.lerp = function(out, a, b, t) {
                var ax = a[0], ay = a[1];
                out[0] = ax + t * (b[0] - ax);
                out[1] = ay + t * (b[1] - ay);
                return out
            };
            vec2.transformMat2 = function(out, a, m) {
                var x = a[0], y = a[1];
                out[0] = x * m[0] + y * m[1];
                out[1] = x * m[2] + y * m[3];
                return out
            };
            vec2.forEach = function() {
                var vec = new Float32Array(2);
                return function(a, stride, offset, count, fn, arg) {
                    var i, l;
                    if (!stride) {
                        stride = 2
                    }
                    if (!offset) {
                        offset = 0
                    }
                    if (count) {
                        l = Math.min(count * stride + offset, a.length)
                    } else {
                        l = a.length
                    }
                    for (i = offset; i < l; i += stride) {
                        vec[0] = a[i];
                        vec[1] = a[i + 1];
                        fn(vec, vec, arg);
                        a[i] = vec[0];
                        a[i + 1] = vec[1]
                    }
                    return a
                }
            }();
            vec2.str = function(a) {
                return "vec2(" + a[0] + ", " + a[1] + ")"
            };
            if (typeof exports !== "undefined") {
                exports.vec2 = vec2
            }
            var vec3 = {};
            if (!GLMAT_EPSILON) {
                var GLMAT_EPSILON = 1e-6
            }
            vec3.create = function() {
                return new Float32Array(3)
            };
            vec3.clone = function(a) {
                var out = new Float32Array(3);
                out[0] = a[0];
                out[1] = a[1];
                out[2] = a[2];
                return out
            };
            vec3.fromValues = function(x, y, z) {
                var out = new Float32Array(3);
                out[0] = x;
                out[1] = y;
                out[2] = z;
                return out
            };
            vec3.copy = function(out, a) {
                out[0] = a[0];
                out[1] = a[1];
                out[2] = a[2];
                return out
            };
            vec3.set = function(out, x, y, z) {
                out[0] = x;
                out[1] = y;
                out[2] = z;
                return out
            };
            vec3.add = function(out, a, b) {
                out[0] = a[0] + b[0];
                out[1] = a[1] + b[1];
                out[2] = a[2] + b[2];
                return out
            };
            vec3.sub = vec3.subtract = function(out, a, b) {
                out[0] = a[0] - b[0];
                out[1] = a[1] - b[1];
                out[2] = a[2] - b[2];
                return out
            };
            vec3.mul = vec3.multiply = function(out, a, b) {
                out[0] = a[0] * b[0];
                out[1] = a[1] * b[1];
                out[2] = a[2] * b[2];
                return out
            };
            vec3.div = vec3.divide = function(out, a, b) {
                out[0] = a[0] / b[0];
                out[1] = a[1] / b[1];
                out[2] = a[2] / b[2];
                return out
            };
            vec3.min = function(out, a, b) {
                out[0] = Math.min(a[0], b[0]);
                out[1] = Math.min(a[1], b[1]);
                out[2] = Math.min(a[2], b[2]);
                return out
            };
            vec3.max = function(out, a, b) {
                out[0] = Math.max(a[0], b[0]);
                out[1] = Math.max(a[1], b[1]);
                out[2] = Math.max(a[2], b[2]);
                return out
            };
            vec3.scale = function(out, a, b) {
                out[0] = a[0] * b;
                out[1] = a[1] * b;
                out[2] = a[2] * b;
                return out
            };
            vec3.dist = vec3.distance = function(a, b) {
                var x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
                return Math.sqrt(x * x + y * y + z * z)
            };
            vec3.sqrDist = vec3.squaredDistance = function(a, b) {
                var x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
                return x * x + y * y + z * z
            };
            vec3.len = vec3.length = function(a) {
                var x = a[0], y = a[1], z = a[2];
                return Math.sqrt(x * x + y * y + z * z)
            };
            vec3.sqrLen = vec3.squaredLength = function(a) {
                var x = a[0], y = a[1], z = a[2];
                return x * x + y * y + z * z
            };
            vec3.negate = function(out, a) {
                out[0] = -a[0];
                out[1] = -a[1];
                out[2] = -a[2];
                return out
            };
            vec3.normalize = function(out, a) {
                var x = a[0], y = a[1], z = a[2];
                var len = x * x + y * y + z * z;
                if (len > 0) {
                    len = 1 / Math.sqrt(len);
                    out[0] = a[0] * len;
                    out[1] = a[1] * len;
                    out[2] = a[2] * len
                }
                return out
            };
            vec3.dot = function(a, b) {
                return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
            };
            vec3.cross = function(out, a, b) {
                var ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2];
                out[0] = ay * bz - az * by;
                out[1] = az * bx - ax * bz;
                out[2] = ax * by - ay * bx;
                return out
            };
            vec3.lerp = function(out, a, b, t) {
                var ax = a[0], ay = a[1], az = a[2];
                out[0] = ax + t * (b[0] - ax);
                out[1] = ay + t * (b[1] - ay);
                out[2] = az + t * (b[2] - az);
                return out
            };
            vec3.transformMat4 = function(out, a, m) {
                var x = a[0], y = a[1], z = a[2];
                out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
                out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
                out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
                return out
            };
            vec3.transformQuat = function(out, a, q) {
                var x = a[0], y = a[1], z = a[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3], ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
                out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
                out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
                out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
                return out
            };
            vec3.forEach = function() {
                var vec = new Float32Array(3);
                return function(a, stride, offset, count, fn, arg) {
                    var i, l;
                    if (!stride) {
                        stride = 3
                    }
                    if (!offset) {
                        offset = 0
                    }
                    if (count) {
                        l = Math.min(count * stride + offset, a.length)
                    } else {
                        l = a.length
                    }
                    for (i = offset; i < l; i += stride) {
                        vec[0] = a[i];
                        vec[1] = a[i + 1];
                        vec[2] = a[i + 2];
                        fn(vec, vec, arg);
                        a[i] = vec[0];
                        a[i + 1] = vec[1];
                        a[i + 2] = vec[2]
                    }
                    return a
                }
            }();
            vec3.str = function(a) {
                return "vec3(" + a[0] + ", " + a[1] + ", " + a[2] + ")"
            };
            if (typeof exports !== "undefined") {
                exports.vec3 = vec3
            }
            var vec4 = {};
            if (!GLMAT_EPSILON) {
                var GLMAT_EPSILON = 1e-6
            }
            vec4.create = function() {
                return new Float32Array(4)
            };
            vec4.clone = function(a) {
                var out = new Float32Array(4);
                out[0] = a[0];
                out[1] = a[1];
                out[2] = a[2];
                out[3] = a[3];
                return out
            };
            vec4.fromValues = function(x, y, z, w) {
                var out = new Float32Array(4);
                out[0] = x;
                out[1] = y;
                out[2] = z;
                out[3] = w;
                return out
            };
            vec4.copy = function(out, a) {
                out[0] = a[0];
                out[1] = a[1];
                out[2] = a[2];
                out[3] = a[3];
                return out
            };
            vec4.set = function(out, x, y, z, w) {
                out[0] = x;
                out[1] = y;
                out[2] = z;
                out[3] = w;
                return out
            };
            vec4.add = function(out, a, b) {
                out[0] = a[0] + b[0];
                out[1] = a[1] + b[1];
                out[2] = a[2] + b[2];
                out[3] = a[3] + b[3];
                return out
            };
            vec4.sub = vec4.subtract = function(out, a, b) {
                out[0] = a[0] - b[0];
                out[1] = a[1] - b[1];
                out[2] = a[2] - b[2];
                out[3] = a[3] - b[3];
                return out
            };
            vec4.mul = vec4.multiply = function(out, a, b) {
                out[0] = a[0] * b[0];
                out[1] = a[1] * b[1];
                out[2] = a[2] * b[2];
                out[3] = a[3] * b[3];
                return out
            };
            vec4.div = vec4.divide = function(out, a, b) {
                out[0] = a[0] / b[0];
                out[1] = a[1] / b[1];
                out[2] = a[2] / b[2];
                out[3] = a[3] / b[3];
                return out
            };
            vec4.min = function(out, a, b) {
                out[0] = Math.min(a[0], b[0]);
                out[1] = Math.min(a[1], b[1]);
                out[2] = Math.min(a[2], b[2]);
                out[3] = Math.min(a[3], b[3]);
                return out
            };
            vec4.max = function(out, a, b) {
                out[0] = Math.max(a[0], b[0]);
                out[1] = Math.max(a[1], b[1]);
                out[2] = Math.max(a[2], b[2]);
                out[3] = Math.max(a[3], b[3]);
                return out
            };
            vec4.scale = function(out, a, b) {
                out[0] = a[0] * b;
                out[1] = a[1] * b;
                out[2] = a[2] * b;
                out[3] = a[3] * b;
                return out
            };
            vec4.dist = vec4.distance = function(a, b) {
                var x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2], w = b[3] - a[3];
                return Math.sqrt(x * x + y * y + z * z + w * w)
            };
            vec4.sqrDist = vec4.squaredDistance = function(a, b) {
                var x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2], w = b[3] - a[3];
                return x * x + y * y + z * z + w * w
            };
            vec4.len = vec4.length = function(a) {
                var x = a[0], y = a[1], z = a[2], w = a[3];
                return Math.sqrt(x * x + y * y + z * z + w * w)
            };
            vec4.sqrLen = vec4.squaredLength = function(a) {
                var x = a[0], y = a[1], z = a[2], w = a[3];
                return x * x + y * y + z * z + w * w
            };
            vec4.negate = function(out, a) {
                out[0] = -a[0];
                out[1] = -a[1];
                out[2] = -a[2];
                out[3] = -a[3];
                return out
            };
            vec4.normalize = function(out, a) {
                var x = a[0], y = a[1], z = a[2], w = a[3];
                var len = x * x + y * y + z * z + w * w;
                if (len > 0) {
                    len = 1 / Math.sqrt(len);
                    out[0] = a[0] * len;
                    out[1] = a[1] * len;
                    out[2] = a[2] * len;
                    out[3] = a[3] * len
                }
                return out
            };
            vec4.dot = function(a, b) {
                return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
            };
            vec4.lerp = function(out, a, b, t) {
                var ax = a[0], ay = a[1], az = a[2], aw = a[3];
                out[0] = ax + t * (b[0] - ax);
                out[1] = ay + t * (b[1] - ay);
                out[2] = az + t * (b[2] - az);
                out[3] = aw + t * (b[3] - aw);
                return out
            };
            vec4.transformMat4 = function(out, a, m) {
                var x = a[0], y = a[1], z = a[2], w = a[3];
                out[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
                out[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
                out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
                out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
                return out
            };
            vec4.transformQuat = function(out, a, q) {
                var x = a[0], y = a[1], z = a[2], qx = q[0], qy = q[1], qz = q[2], qw = q[3], ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z;
                out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
                out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
                out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
                return out
            };
            vec4.forEach = function() {
                var vec = new Float32Array(4);
                return function(a, stride, offset, count, fn, arg) {
                    var i, l;
                    if (!stride) {
                        stride = 4
                    }
                    if (!offset) {
                        offset = 0
                    }
                    if (count) {
                        l = Math.min(count * stride + offset, a.length)
                    } else {
                        l = a.length
                    }
                    for (i = offset; i < l; i += stride) {
                        vec[0] = a[i];
                        vec[1] = a[i + 1];
                        vec[2] = a[i + 2];
                        vec[3] = a[i + 3];
                        fn(vec, vec, arg);
                        a[i] = vec[0];
                        a[i + 1] = vec[1];
                        a[i + 2] = vec[2];
                        a[i + 3] = vec[3]
                    }
                    return a
                }
            }();
            vec4.str = function(a) {
                return "vec4(" + a[0] + ", " + a[1] + ", " + a[2] + ", " + a[3] + ")"
            };
            if (typeof exports !== "undefined") {
                exports.vec4 = vec4
            }
            var mat2 = {};
            var mat2Identity = new Float32Array([1, 0, 0, 1]);
            if (!GLMAT_EPSILON) {
                var GLMAT_EPSILON = 1e-6
            }
            mat2.create = function() {
                return new Float32Array(mat2Identity)
            };
            mat2.clone = function(a) {
                var out = new Float32Array(4);
                out[0] = a[0];
                out[1] = a[1];
                out[2] = a[2];
                out[3] = a[3];
                return out
            };
            mat2.copy = function(out, a) {
                out[0] = a[0];
                out[1] = a[1];
                out[2] = a[2];
                out[3] = a[3];
                return out
            };
            mat2.identity = function(out) {
                out[0] = 1;
                out[1] = 0;
                out[2] = 0;
                out[3] = 1;
                return out
            };
            mat2.transpose = function(out, a) {
                if (out === a) {
                    var a1 = a[1];
                    out[1] = a[2];
                    out[2] = a1
                } else {
                    out[0] = a[0];
                    out[1] = a[2];
                    out[2] = a[1];
                    out[3] = a[3]
                }
                return out
            };
            mat2.invert = function(out, a) {
                var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], det = a0 * a3 - a2 * a1;
                if (!det) {
                    return null
                }
                det = 1 / det;
                out[0] = a3 * det;
                out[1] = -a1 * det;
                out[2] = -a2 * det;
                out[3] = a0 * det;
                return out
            };
            mat2.adjoint = function(out, a) {
                var a0 = a[0];
                out[0] = a[3];
                out[1] = -a[1];
                out[2] = -a[2];
                out[3] = a0;
                return out
            };
            mat2.determinant = function(a) {
                return a[0] * a[3] - a[2] * a[1]
            };
            mat2.mul = mat2.multiply = function(out, a, b) {
                var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3];
                var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
                out[0] = a0 * b0 + a1 * b2;
                out[1] = a0 * b1 + a1 * b3;
                out[2] = a2 * b0 + a3 * b2;
                out[3] = a2 * b1 + a3 * b3;
                return out
            };
            mat2.rotate = function(out, a, rad) {
                var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], s = Math.sin(rad), c = Math.cos(rad);
                out[0] = a0 * c + a1 * s;
                out[1] = a0 * -s + a1 * c;
                out[2] = a2 * c + a3 * s;
                out[3] = a2 * -s + a3 * c;
                return out
            };
            mat2.scale = function(out, a, v) {
                var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], v0 = v[0], v1 = v[1];
                out[0] = a0 * v0;
                out[1] = a1 * v1;
                out[2] = a2 * v0;
                out[3] = a3 * v1;
                return out
            };
            mat2.str = function(a) {
                return "mat2(" + a[0] + ", " + a[1] + ", " + a[2] + ", " + a[3] + ")"
            };
            if (typeof exports !== "undefined") {
                exports.mat2 = mat2
            }
            var mat3 = {};
            var mat3Identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
            if (!GLMAT_EPSILON) {
                var GLMAT_EPSILON = 1e-6
            }
            mat3.create = function() {
                return new Float32Array(mat3Identity)
            };
            mat3.clone = function(a) {
                var out = new Float32Array(9);
                out[0] = a[0];
                out[1] = a[1];
                out[2] = a[2];
                out[3] = a[3];
                out[4] = a[4];
                out[5] = a[5];
                out[6] = a[6];
                out[7] = a[7];
                out[8] = a[8];
                return out
            };
            mat3.copy = function(out, a) {
                out[0] = a[0];
                out[1] = a[1];
                out[2] = a[2];
                out[3] = a[3];
                out[4] = a[4];
                out[5] = a[5];
                out[6] = a[6];
                out[7] = a[7];
                out[8] = a[8];
                return out
            };
            mat3.identity = function(out) {
                out[0] = 1;
                out[1] = 0;
                out[2] = 0;
                out[3] = 0;
                out[4] = 1;
                out[5] = 0;
                out[6] = 0;
                out[7] = 0;
                out[8] = 1;
                return out
            };
            mat3.transpose = function(out, a) {
                if (out === a) {
                    var a01 = a[1], a02 = a[2], a12 = a[5];
                    out[1] = a[3];
                    out[2] = a[6];
                    out[3] = a01;
                    out[5] = a[7];
                    out[6] = a02;
                    out[7] = a12
                } else {
                    out[0] = a[0];
                    out[1] = a[3];
                    out[2] = a[6];
                    out[3] = a[1];
                    out[4] = a[4];
                    out[5] = a[7];
                    out[6] = a[2];
                    out[7] = a[5];
                    out[8] = a[8]
                }
                return out
            };
            mat3.invert = function(out, a) {
                var a00 = a[0], a01 = a[1], a02 = a[2], a10 = a[3], a11 = a[4], a12 = a[5], a20 = a[6], a21 = a[7], a22 = a[8], b01 = a22 * a11 - a12 * a21, b11 = -a22 * a10 + a12 * a20, b21 = a21 * a10 - a11 * a20, det = a00 * b01 + a01 * b11 + a02 * b21;
                if (!det) {
                    return null
                }
                det = 1 / det;
                out[0] = b01 * det;
                out[1] = (-a22 * a01 + a02 * a21) * det;
                out[2] = (a12 * a01 - a02 * a11) * det;
                out[3] = b11 * det;
                out[4] = (a22 * a00 - a02 * a20) * det;
                out[5] = (-a12 * a00 + a02 * a10) * det;
                out[6] = b21 * det;
                out[7] = (-a21 * a00 + a01 * a20) * det;
                out[8] = (a11 * a00 - a01 * a10) * det;
                return out
            };
            mat3.adjoint = function(out, a) {
                var a00 = a[0], a01 = a[1], a02 = a[2], a10 = a[3], a11 = a[4], a12 = a[5], a20 = a[6], a21 = a[7], a22 = a[8];
                out[0] = a11 * a22 - a12 * a21;
                out[1] = a02 * a21 - a01 * a22;
                out[2] = a01 * a12 - a02 * a11;
                out[3] = a12 * a20 - a10 * a22;
                out[4] = a00 * a22 - a02 * a20;
                out[5] = a02 * a10 - a00 * a12;
                out[6] = a10 * a21 - a11 * a20;
                out[7] = a01 * a20 - a00 * a21;
                out[8] = a00 * a11 - a01 * a10;
                return out
            };
            mat3.determinant = function(a) {
                var a00 = a[0], a01 = a[1], a02 = a[2], a10 = a[3], a11 = a[4], a12 = a[5], a20 = a[6], a21 = a[7], a22 = a[8];
                return a00 * (a22 * a11 - a12 * a21) + a01 * (-a22 * a10 + a12 * a20) + a02 * (a21 * a10 - a11 * a20)
            };
            mat3.mul = mat3.multiply = function(out, a, b) {
                var a00 = a[0], a01 = a[1], a02 = a[2], a10 = a[3], a11 = a[4], a12 = a[5], a20 = a[6], a21 = a[7], a22 = a[8], b00 = b[0], b01 = b[1], b02 = b[2], b10 = b[3], b11 = b[4], b12 = b[5], b20 = b[6], b21 = b[7], b22 = b[8];
                out[0] = b00 * a00 + b01 * a10 + b02 * a20;
                out[1] = b00 * a01 + b01 * a11 + b02 * a21;
                out[2] = b00 * a02 + b01 * a12 + b02 * a22;
                out[3] = b10 * a00 + b11 * a10 + b12 * a20;
                out[4] = b10 * a01 + b11 * a11 + b12 * a21;
                out[5] = b10 * a02 + b11 * a12 + b12 * a22;
                out[6] = b20 * a00 + b21 * a10 + b22 * a20;
                out[7] = b20 * a01 + b21 * a11 + b22 * a21;
                out[8] = b20 * a02 + b21 * a12 + b22 * a22;
                return out
            };
            mat3.str = function(a) {
                return "mat3(" + a[0] + ", " + a[1] + ", " + a[2] + ", " + a[3] + ", " + a[4] + ", " + a[5] + ", " + a[6] + ", " + a[7] + ", " + a[8] + ")"
            };
            if (typeof exports !== "undefined") {
                exports.mat3 = mat3
            }
            var mat4 = {};
            var mat4Identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
            if (!GLMAT_EPSILON) {
                var GLMAT_EPSILON = 1e-6
            }
            mat4.create = function() {
                return new Float32Array(mat4Identity)
            };
            mat4.clone = function(a) {
                var out = new Float32Array(16);
                out[0] = a[0];
                out[1] = a[1];
                out[2] = a[2];
                out[3] = a[3];
                out[4] = a[4];
                out[5] = a[5];
                out[6] = a[6];
                out[7] = a[7];
                out[8] = a[8];
                out[9] = a[9];
                out[10] = a[10];
                out[11] = a[11];
                out[12] = a[12];
                out[13] = a[13];
                out[14] = a[14];
                out[15] = a[15];
                return out
            };
            mat4.copy = function(out, a) {
                out[0] = a[0];
                out[1] = a[1];
                out[2] = a[2];
                out[3] = a[3];
                out[4] = a[4];
                out[5] = a[5];
                out[6] = a[6];
                out[7] = a[7];
                out[8] = a[8];
                out[9] = a[9];
                out[10] = a[10];
                out[11] = a[11];
                out[12] = a[12];
                out[13] = a[13];
                out[14] = a[14];
                out[15] = a[15];
                return out
            };
            mat4.identity = function(out) {
                out[0] = 1;
                out[1] = 0;
                out[2] = 0;
                out[3] = 0;
                out[4] = 0;
                out[5] = 1;
                out[6] = 0;
                out[7] = 0;
                out[8] = 0;
                out[9] = 0;
                out[10] = 1;
                out[11] = 0;
                out[12] = 0;
                out[13] = 0;
                out[14] = 0;
                out[15] = 1;
                return out
            };
            mat4.transpose = function(out, a) {
                if (out === a) {
                    var a01 = a[1], a02 = a[2], a03 = a[3], a12 = a[6], a13 = a[7], a23 = a[11];
                    out[1] = a[4];
                    out[2] = a[8];
                    out[3] = a[12];
                    out[4] = a01;
                    out[6] = a[9];
                    out[7] = a[13];
                    out[8] = a02;
                    out[9] = a12;
                    out[11] = a[14];
                    out[12] = a03;
                    out[13] = a13;
                    out[14] = a23
                } else {
                    out[0] = a[0];
                    out[1] = a[4];
                    out[2] = a[8];
                    out[3] = a[12];
                    out[4] = a[1];
                    out[5] = a[5];
                    out[6] = a[9];
                    out[7] = a[13];
                    out[8] = a[2];
                    out[9] = a[6];
                    out[10] = a[10];
                    out[11] = a[14];
                    out[12] = a[3];
                    out[13] = a[7];
                    out[14] = a[11];
                    out[15] = a[15]
                }
                return out
            };
            mat4.invert = function(out, a) {
                var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15], b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32, det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
                if (!det) {
                    return null
                }
                det = 1 / det;
                out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
                out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
                out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
                out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
                out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
                out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
                out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
                out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
                out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
                out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
                out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
                out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
                out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
                out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
                out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
                out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
                return out
            };
            mat4.adjoint = function(out, a) {
                var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
                out[0] = a11 * (a22 * a33 - a23 * a32) - a21 * (a12 * a33 - a13 * a32) + a31 * (a12 * a23 - a13 * a22);
                out[1] = -(a01 * (a22 * a33 - a23 * a32) - a21 * (a02 * a33 - a03 * a32) + a31 * (a02 * a23 - a03 * a22));
                out[2] = a01 * (a12 * a33 - a13 * a32) - a11 * (a02 * a33 - a03 * a32) + a31 * (a02 * a13 - a03 * a12);
                out[3] = -(a01 * (a12 * a23 - a13 * a22) - a11 * (a02 * a23 - a03 * a22) + a21 * (a02 * a13 - a03 * a12));
                out[4] = -(a10 * (a22 * a33 - a23 * a32) - a20 * (a12 * a33 - a13 * a32) + a30 * (a12 * a23 - a13 * a22));
                out[5] = a00 * (a22 * a33 - a23 * a32) - a20 * (a02 * a33 - a03 * a32) + a30 * (a02 * a23 - a03 * a22);
                out[6] = -(a00 * (a12 * a33 - a13 * a32) - a10 * (a02 * a33 - a03 * a32) + a30 * (a02 * a13 - a03 * a12));
                out[7] = a00 * (a12 * a23 - a13 * a22) - a10 * (a02 * a23 - a03 * a22) + a20 * (a02 * a13 - a03 * a12);
                out[8] = a10 * (a21 * a33 - a23 * a31) - a20 * (a11 * a33 - a13 * a31) + a30 * (a11 * a23 - a13 * a21);
                out[9] = -(a00 * (a21 * a33 - a23 * a31) - a20 * (a01 * a33 - a03 * a31) + a30 * (a01 * a23 - a03 * a21));
                out[10] = a00 * (a11 * a33 - a13 * a31) - a10 * (a01 * a33 - a03 * a31) + a30 * (a01 * a13 - a03 * a11);
                out[11] = -(a00 * (a11 * a23 - a13 * a21) - a10 * (a01 * a23 - a03 * a21) + a20 * (a01 * a13 - a03 * a11));
                out[12] = -(a10 * (a21 * a32 - a22 * a31) - a20 * (a11 * a32 - a12 * a31) + a30 * (a11 * a22 - a12 * a21));
                out[13] = a00 * (a21 * a32 - a22 * a31) - a20 * (a01 * a32 - a02 * a31) + a30 * (a01 * a22 - a02 * a21);
                out[14] = -(a00 * (a11 * a32 - a12 * a31) - a10 * (a01 * a32 - a02 * a31) + a30 * (a01 * a12 - a02 * a11));
                out[15] = a00 * (a11 * a22 - a12 * a21) - a10 * (a01 * a22 - a02 * a21) + a20 * (a01 * a12 - a02 * a11);
                return out
            };
            mat4.determinant = function(a) {
                var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15], b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
                return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06
            };
            mat4.mul = mat4.multiply = function(out, a, b) {
                var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
                var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
                out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
                out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
                out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
                out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
                b0 = b[4];
                b1 = b[5];
                b2 = b[6];
                b3 = b[7];
                out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
                out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
                out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
                out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
                b0 = b[8];
                b1 = b[9];
                b2 = b[10];
                b3 = b[11];
                out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
                out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
                out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
                out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
                b0 = b[12];
                b1 = b[13];
                b2 = b[14];
                b3 = b[15];
                out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
                out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
                out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
                out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
                return out
            };
            mat4.translate = function(out, a, v) {
                var x = v[0], y = v[1], z = v[2], a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23;
                if (a === out) {
                    out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
                    out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
                    out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
                    out[15] = a[3] * x + a[7] * y + a[11] * z + a[15]
                } else {
                    a00 = a[0];
                    a01 = a[1];
                    a02 = a[2];
                    a03 = a[3];
                    a10 = a[4];
                    a11 = a[5];
                    a12 = a[6];
                    a13 = a[7];
                    a20 = a[8];
                    a21 = a[9];
                    a22 = a[10];
                    a23 = a[11];
                    out[0] = a00;
                    out[1] = a01;
                    out[2] = a02;
                    out[3] = a03;
                    out[4] = a10;
                    out[5] = a11;
                    out[6] = a12;
                    out[7] = a13;
                    out[8] = a20;
                    out[9] = a21;
                    out[10] = a22;
                    out[11] = a23;
                    out[12] = a00 * x + a10 * y + a20 * z + a[12];
                    out[13] = a01 * x + a11 * y + a21 * z + a[13];
                    out[14] = a02 * x + a12 * y + a22 * z + a[14];
                    out[15] = a03 * x + a13 * y + a23 * z + a[15]
                }
                return out
            };
            mat4.scale = function(out, a, v) {
                var x = v[0], y = v[1], z = v[2];
                out[0] = a[0] * x;
                out[1] = a[1] * x;
                out[2] = a[2] * x;
                out[3] = a[3] * x;
                out[4] = a[4] * y;
                out[5] = a[5] * y;
                out[6] = a[6] * y;
                out[7] = a[7] * y;
                out[8] = a[8] * z;
                out[9] = a[9] * z;
                out[10] = a[10] * z;
                out[11] = a[11] * z;
                out[12] = a[12];
                out[13] = a[13];
                out[14] = a[14];
                out[15] = a[15];
                return out
            };
            mat4.rotate = function(out, a, rad, axis) {
                var x = axis[0], y = axis[1], z = axis[2], len = Math.sqrt(x * x + y * y + z * z), s, c, t, a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, b00, b01, b02, b10, b11, b12, b20, b21, b22;
                if (Math.abs(len) < GLMAT_EPSILON) {
                    return null
                }
                len = 1 / len;
                x *= len;
                y *= len;
                z *= len;
                s = Math.sin(rad);
                c = Math.cos(rad);
                t = 1 - c;
                a00 = a[0];
                a01 = a[1];
                a02 = a[2];
                a03 = a[3];
                a10 = a[4];
                a11 = a[5];
                a12 = a[6];
                a13 = a[7];
                a20 = a[8];
                a21 = a[9];
                a22 = a[10];
                a23 = a[11];
                b00 = x * x * t + c;
                b01 = y * x * t + z * s;
                b02 = z * x * t - y * s;
                b10 = x * y * t - z * s;
                b11 = y * y * t + c;
                b12 = z * y * t + x * s;
                b20 = x * z * t + y * s;
                b21 = y * z * t - x * s;
                b22 = z * z * t + c;
                out[0] = a00 * b00 + a10 * b01 + a20 * b02;
                out[1] = a01 * b00 + a11 * b01 + a21 * b02;
                out[2] = a02 * b00 + a12 * b01 + a22 * b02;
                out[3] = a03 * b00 + a13 * b01 + a23 * b02;
                out[4] = a00 * b10 + a10 * b11 + a20 * b12;
                out[5] = a01 * b10 + a11 * b11 + a21 * b12;
                out[6] = a02 * b10 + a12 * b11 + a22 * b12;
                out[7] = a03 * b10 + a13 * b11 + a23 * b12;
                out[8] = a00 * b20 + a10 * b21 + a20 * b22;
                out[9] = a01 * b20 + a11 * b21 + a21 * b22;
                out[10] = a02 * b20 + a12 * b21 + a22 * b22;
                out[11] = a03 * b20 + a13 * b21 + a23 * b22;
                if (a !== out) {
                    out[12] = a[12];
                    out[13] = a[13];
                    out[14] = a[14];
                    out[15] = a[15]
                }
                return out
            };
            mat4.rotateX = function(out, a, rad) {
                var s = Math.sin(rad), c = Math.cos(rad), a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
                if (a !== out) {
                    out[0] = a[0];
                    out[1] = a[1];
                    out[2] = a[2];
                    out[3] = a[3];
                    out[12] = a[12];
                    out[13] = a[13];
                    out[14] = a[14];
                    out[15] = a[15]
                }
                out[4] = a10 * c + a20 * s;
                out[5] = a11 * c + a21 * s;
                out[6] = a12 * c + a22 * s;
                out[7] = a13 * c + a23 * s;
                out[8] = a20 * c - a10 * s;
                out[9] = a21 * c - a11 * s;
                out[10] = a22 * c - a12 * s;
                out[11] = a23 * c - a13 * s;
                return out
            };
            mat4.rotateY = function(out, a, rad) {
                var s = Math.sin(rad), c = Math.cos(rad), a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
                if (a !== out) {
                    out[4] = a[4];
                    out[5] = a[5];
                    out[6] = a[6];
                    out[7] = a[7];
                    out[12] = a[12];
                    out[13] = a[13];
                    out[14] = a[14];
                    out[15] = a[15]
                }
                out[0] = a00 * c - a20 * s;
                out[1] = a01 * c - a21 * s;
                out[2] = a02 * c - a22 * s;
                out[3] = a03 * c - a23 * s;
                out[8] = a00 * s + a20 * c;
                out[9] = a01 * s + a21 * c;
                out[10] = a02 * s + a22 * c;
                out[11] = a03 * s + a23 * c;
                return out
            };
            mat4.rotateZ = function(out, a, rad) {
                var s = Math.sin(rad), c = Math.cos(rad), a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
                if (a !== out) {
                    out[8] = a[8];
                    out[9] = a[9];
                    out[10] = a[10];
                    out[11] = a[11];
                    out[12] = a[12];
                    out[13] = a[13];
                    out[14] = a[14];
                    out[15] = a[15]
                }
                out[0] = a00 * c + a10 * s;
                out[1] = a01 * c + a11 * s;
                out[2] = a02 * c + a12 * s;
                out[3] = a03 * c + a13 * s;
                out[4] = a10 * c - a00 * s;
                out[5] = a11 * c - a01 * s;
                out[6] = a12 * c - a02 * s;
                out[7] = a13 * c - a03 * s;
                return out
            };
            mat4.fromRotationTranslation = function(out, q, v) {
                var x = q[0], y = q[1], z = q[2], w = q[3], x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
                out[0] = 1 - (yy + zz);
                out[1] = xy + wz;
                out[2] = xz - wy;
                out[3] = 0;
                out[4] = xy - wz;
                out[5] = 1 - (xx + zz);
                out[6] = yz + wx;
                out[7] = 0;
                out[8] = xz + wy;
                out[9] = yz - wx;
                out[10] = 1 - (xx + yy);
                out[11] = 0;
                out[12] = v[0];
                out[13] = v[1];
                out[14] = v[2];
                out[15] = 1;
                return out
            };
            mat4.frustum = function(out, left, right, bottom, top, near, far) {
                var rl = 1 / (right - left), tb = 1 / (top - bottom), nf = 1 / (near - far);
                out[0] = near * 2 * rl;
                out[1] = 0;
                out[2] = 0;
                out[3] = 0;
                out[4] = 0;
                out[5] = near * 2 * tb;
                out[6] = 0;
                out[7] = 0;
                out[8] = (right + left) * rl;
                out[9] = (top + bottom) * tb;
                out[10] = (far + near) * nf;
                out[11] = -1;
                out[12] = 0;
                out[13] = 0;
                out[14] = far * near * 2 * nf;
                out[15] = 0;
                return out
            };
            mat4.perspective = function(out, fovy, aspect, near, far) {
                var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
                out[0] = f / aspect;
                out[1] = 0;
                out[2] = 0;
                out[3] = 0;
                out[4] = 0;
                out[5] = f;
                out[6] = 0;
                out[7] = 0;
                out[8] = 0;
                out[9] = 0;
                out[10] = (far + near) * nf;
                out[11] = -1;
                out[12] = 0;
                out[13] = 0;
                out[14] = 2 * far * near * nf;
                out[15] = 0;
                return out
            };
            mat4.ortho = function(out, left, right, bottom, top, near, far) {
                var lr = 1 / (left - right), bt = 1 / (bottom - top), nf = 1 / (near - far);
                out[0] = -2 * lr;
                out[1] = 0;
                out[2] = 0;
                out[3] = 0;
                out[4] = 0;
                out[5] = -2 * bt;
                out[6] = 0;
                out[7] = 0;
                out[8] = 0;
                out[9] = 0;
                out[10] = 2 * nf;
                out[11] = 0;
                out[12] = (left + right) * lr;
                out[13] = (top + bottom) * bt;
                out[14] = (far + near) * nf;
                out[15] = 1;
                return out
            };
            mat4.lookAt = function(out, eye, center, up) {
                var x0, x1, x2, y0, y1, y2, z0, z1, z2, len, eyex = eye[0], eyey = eye[1], eyez = eye[2], upx = up[0], upy = up[1], upz = up[2], centerx = center[0], centery = center[1], centerz = center[2];
                if (Math.abs(eyex - centerx) < GLMAT_EPSILON && Math.abs(eyey - centery) < GLMAT_EPSILON && Math.abs(eyez - centerz) < GLMAT_EPSILON) {
                    return mat4.identity(out)
                }
                z0 = eyex - centerx;
                z1 = eyey - centery;
                z2 = eyez - centerz;
                len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
                z0 *= len;
                z1 *= len;
                z2 *= len;
                x0 = upy * z2 - upz * z1;
                x1 = upz * z0 - upx * z2;
                x2 = upx * z1 - upy * z0;
                len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
                if (!len) {
                    x0 = 0;
                    x1 = 0;
                    x2 = 0
                } else {
                    len = 1 / len;
                    x0 *= len;
                    x1 *= len;
                    x2 *= len
                }
                y0 = z1 * x2 - z2 * x1;
                y1 = z2 * x0 - z0 * x2;
                y2 = z0 * x1 - z1 * x0;
                len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
                if (!len) {
                    y0 = 0;
                    y1 = 0;
                    y2 = 0
                } else {
                    len = 1 / len;
                    y0 *= len;
                    y1 *= len;
                    y2 *= len
                }
                out[0] = x0;
                out[1] = y0;
                out[2] = z0;
                out[3] = 0;
                out[4] = x1;
                out[5] = y1;
                out[6] = z1;
                out[7] = 0;
                out[8] = x2;
                out[9] = y2;
                out[10] = z2;
                out[11] = 0;
                out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
                out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
                out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
                out[15] = 1;
                return out
            };
            mat4.str = function(a) {
                return "mat4(" + a[0] + ", " + a[1] + ", " + a[2] + ", " + a[3] + ", " + a[4] + ", " + a[5] + ", " + a[6] + ", " + a[7] + ", " + a[8] + ", " + a[9] + ", " + a[10] + ", " + a[11] + ", " + a[12] + ", " + a[13] + ", " + a[14] + ", " + a[15] + ")"
            };
            if (typeof exports !== "undefined") {
                exports.mat4 = mat4
            }
            var quat = {};
            var quatIdentity = new Float32Array([0, 0, 0, 1]);
            if (!GLMAT_EPSILON) {
                var GLMAT_EPSILON = 1e-6
            }
            quat.create = function() {
                return new Float32Array(quatIdentity)
            };
            quat.clone = vec4.clone;
            quat.fromValues = vec4.fromValues;
            quat.copy = vec4.copy;
            quat.set = vec4.set;
            quat.identity = function(out) {
                out[0] = 0;
                out[1] = 0;
                out[2] = 0;
                out[3] = 1;
                return out
            };
            quat.setAxisAngle = function(out, axis, rad) {
                rad = rad * .5;
                var s = Math.sin(rad);
                out[0] = s * axis[0];
                out[1] = s * axis[1];
                out[2] = s * axis[2];
                out[3] = Math.cos(rad);
                return out
            };
            quat.add = vec4.add;
            quat.mul = quat.multiply = function(out, a, b) {
                var ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = b[3];
                out[0] = ax * bw + aw * bx + ay * bz - az * by;
                out[1] = ay * bw + aw * by + az * bx - ax * bz;
                out[2] = az * bw + aw * bz + ax * by - ay * bx;
                out[3] = aw * bw - ax * bx - ay * by - az * bz;
                return out
            };
            quat.scale = vec4.scale;
            quat.rotateX = function(out, a, rad) {
                rad *= .5;
                var ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = Math.sin(rad), bw = Math.cos(rad);
                out[0] = ax * bw + aw * bx;
                out[1] = ay * bw + az * bx;
                out[2] = az * bw - ay * bx;
                out[3] = aw * bw - ax * bx;
                return out
            };
            quat.rotateY = function(out, a, rad) {
                rad *= .5;
                var ax = a[0], ay = a[1], az = a[2], aw = a[3], by = Math.sin(rad), bw = Math.cos(rad);
                out[0] = ax * bw - az * by;
                out[1] = ay * bw + aw * by;
                out[2] = az * bw + ax * by;
                out[3] = aw * bw - ay * by;
                return out
            };
            quat.rotateZ = function(out, a, rad) {
                rad *= .5;
                var ax = a[0], ay = a[1], az = a[2], aw = a[3], bz = Math.sin(rad), bw = Math.cos(rad);
                out[0] = ax * bw + ay * bz;
                out[1] = ay * bw - ax * bz;
                out[2] = az * bw + aw * bz;
                out[3] = aw * bw - az * bz;
                return out
            };
            quat.calculateW = function(out, a) {
                var x = a[0], y = a[1], z = a[2];
                out[0] = x;
                out[1] = y;
                out[2] = z;
                out[3] = -Math.sqrt(Math.abs(1 - x * x - y * y - z * z));
                return out
            };
            quat.dot = vec4.dot;
            quat.lerp = vec4.lerp;
            quat.slerp = function(out, a, b, t) {
                var ax = a[0], ay = a[1], az = a[2], aw = a[3], bx = b[0], by = b[1], bz = b[2], bw = a[3];
                var cosHalfTheta = ax * bx + ay * by + az * bz + aw * bw, halfTheta, sinHalfTheta, ratioA, ratioB;
                if (Math.abs(cosHalfTheta) >= 1) {
                    if (out !== a) {
                        out[0] = ax;
                        out[1] = ay;
                        out[2] = az;
                        out[3] = aw
                    }
                    return out
                }
                halfTheta = Math.acos(cosHalfTheta);
                sinHalfTheta = Math.sqrt(1 - cosHalfTheta * cosHalfTheta);
                if (Math.abs(sinHalfTheta) < .001) {
                    out[0] = ax * .5 + bx * .5;
                    out[1] = ay * .5 + by * .5;
                    out[2] = az * .5 + bz * .5;
                    out[3] = aw * .5 + bw * .5;
                    return out
                }
                ratioA = Math.sin((1 - t) * halfTheta) / sinHalfTheta;
                ratioB = Math.sin(t * halfTheta) / sinHalfTheta;
                out[0] = ax * ratioA + bx * ratioB;
                out[1] = ay * ratioA + by * ratioB;
                out[2] = az * ratioA + bz * ratioB;
                out[3] = aw * ratioA + bw * ratioB;
                return out
            };
            quat.invert = function(out, a) {
                var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], dot = a0 * a0 + a1 * a1 + a2 * a2 + a3 * a3, invDot = dot ? 1 / dot : 0;
                out[0] = -a0 * invDot;
                out[1] = -a1 * invDot;
                out[2] = -a2 * invDot;
                out[3] = a3 * invDot;
                return out
            };
            quat.conjugate = function(out, a) {
                out[0] = -a[0];
                out[1] = -a[1];
                out[2] = -a[2];
                out[3] = a[3];
                return out
            };
            quat.len = quat.length = vec4.length;
            quat.sqrLen = quat.squaredLength = vec4.squaredLength;
            quat.normalize = vec4.normalize;
            quat.str = function(a) {
                return "quat(" + a[0] + ", " + a[1] + ", " + a[2] + ", " + a[3] + ")"
            };
            if (typeof exports !== "undefined") {
                exports.quat = quat
            }
        }(shim.exports)
    }()
}, {}],21: [function(require, module, exports) {
    !function() {
        var root = this;
        var previousUnderscore = root._;
        var breaker = {};
        var ArrayProto = Array.prototype, ObjProto = Object.prototype, FuncProto = Function.prototype;
        var push = ArrayProto.push, slice = ArrayProto.slice, concat = ArrayProto.concat, toString = ObjProto.toString, hasOwnProperty = ObjProto.hasOwnProperty;
        var nativeForEach = ArrayProto.forEach, nativeMap = ArrayProto.map, nativeReduce = ArrayProto.reduce, nativeReduceRight = ArrayProto.reduceRight, nativeFilter = ArrayProto.filter, nativeEvery = ArrayProto.every, nativeSome = ArrayProto.some, nativeIndexOf = ArrayProto.indexOf, nativeLastIndexOf = ArrayProto.lastIndexOf, nativeIsArray = Array.isArray, nativeKeys = Object.keys, nativeBind = FuncProto.bind;
        var _ = function(obj) {
            if (obj instanceof _)
                return obj;
            if (!(this instanceof _))
                return new _(obj);
            this._wrapped = obj
        };
        if (typeof exports !== "undefined") {
            if (typeof module !== "undefined" && module.exports) {
                exports = module.exports = _
            }
            exports._ = _
        } else {
            root._ = _
        }
        _.VERSION = "1.4.4";
        var each = _.each = _.forEach = function(obj, iterator, context) {
            if (obj == null)
                return;
            if (nativeForEach && obj.forEach === nativeForEach) {
                obj.forEach(iterator, context)
            } else if (obj.length === +obj.length) {
                for (var i = 0, l = obj.length; i < l; i++) {
                    if (iterator.call(context, obj[i], i, obj) === breaker)
                        return
                }
            } else {
                for (var key in obj) {
                    if (_.has(obj, key)) {
                        if (iterator.call(context, obj[key], key, obj) === breaker)
                            return
                    }
                }
            }
        };
        _.map = _.collect = function(obj, iterator, context) {
            var results = [];
            if (obj == null)
                return results;
            if (nativeMap && obj.map === nativeMap)
                return obj.map(iterator, context);
            each(obj, function(value, index, list) {
                results[results.length] = iterator.call(context, value, index, list)
            });
            return results
        };
        var reduceError = "Reduce of empty array with no initial value";
        _.reduce = _.foldl = _.inject = function(obj, iterator, memo, context) {
            var initial = arguments.length > 2;
            if (obj == null)
                obj = [];
            if (nativeReduce && obj.reduce === nativeReduce) {
                if (context)
                    iterator = _.bind(iterator, context);
                return initial ? obj.reduce(iterator, memo) : obj.reduce(iterator)
            }
            each(obj, function(value, index, list) {
                if (!initial) {
                    memo = value;
                    initial = true
                } else {
                    memo = iterator.call(context, memo, value, index, list)
                }
            });
            if (!initial)
                throw new TypeError(reduceError);
            return memo
        };
        _.reduceRight = _.foldr = function(obj, iterator, memo, context) {
            var initial = arguments.length > 2;
            if (obj == null)
                obj = [];
            if (nativeReduceRight && obj.reduceRight === nativeReduceRight) {
                if (context)
                    iterator = _.bind(iterator, context);
                return initial ? obj.reduceRight(iterator, memo) : obj.reduceRight(iterator)
            }
            var length = obj.length;
            if (length !== +length) {
                var keys = _.keys(obj);
                length = keys.length
            }
            each(obj, function(value, index, list) {
                index = keys ? keys[--length] : --length;
                if (!initial) {
                    memo = obj[index];
                    initial = true
                } else {
                    memo = iterator.call(context, memo, obj[index], index, list)
                }
            });
            if (!initial)
                throw new TypeError(reduceError);
            return memo
        };
        _.find = _.detect = function(obj, iterator, context) {
            var result;
            any(obj, function(value, index, list) {
                if (iterator.call(context, value, index, list)) {
                    result = value;
                    return true
                }
            });
            return result
        };
        _.filter = _.select = function(obj, iterator, context) {
            var results = [];
            if (obj == null)
                return results;
            if (nativeFilter && obj.filter === nativeFilter)
                return obj.filter(iterator, context);
            each(obj, function(value, index, list) {
                if (iterator.call(context, value, index, list))
                    results[results.length] = value
            });
            return results
        };
        _.reject = function(obj, iterator, context) {
            return _.filter(obj, function(value, index, list) {
                return !iterator.call(context, value, index, list)
            }, context)
        };
        _.every = _.all = function(obj, iterator, context) {
            iterator || (iterator = _.identity);
            var result = true;
            if (obj == null)
                return result;
            if (nativeEvery && obj.every === nativeEvery)
                return obj.every(iterator, context);
            each(obj, function(value, index, list) {
                if (!(result = result && iterator.call(context, value, index, list)))
                    return breaker
            });
            return !!result
        };
        var any = _.some = _.any = function(obj, iterator, context) {
            iterator || (iterator = _.identity);
            var result = false;
            if (obj == null)
                return result;
            if (nativeSome && obj.some === nativeSome)
                return obj.some(iterator, context);
            each(obj, function(value, index, list) {
                if (result || (result = iterator.call(context, value, index, list)))
                    return breaker
            });
            return !!result
        };
        _.contains = _.include = function(obj, target) {
            if (obj == null)
                return false;
            if (nativeIndexOf && obj.indexOf === nativeIndexOf)
                return obj.indexOf(target) != -1;
            return any(obj, function(value) {
                return value === target
            })
        };
        _.invoke = function(obj, method) {
            var args = slice.call(arguments, 2);
            var isFunc = _.isFunction(method);
            return _.map(obj, function(value) {
                return (isFunc ? method : value[method]).apply(value, args)
            })
        };
        _.pluck = function(obj, key) {
            return _.map(obj, function(value) {
                return value[key]
            })
        };
        _.where = function(obj, attrs, first) {
            if (_.isEmpty(attrs))
                return first ? null : [];
            return _[first ? "find" : "filter"](obj, function(value) {
                for (var key in attrs) {
                    if (attrs[key] !== value[key])
                        return false
                }
                return true
            })
        };
        _.findWhere = function(obj, attrs) {
            return _.where(obj, attrs, true)
        };
        _.max = function(obj, iterator, context) {
            if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
                return Math.max.apply(Math, obj)
            }
            if (!iterator && _.isEmpty(obj))
                return -Infinity;
            var result = {computed: -Infinity,value: -Infinity};
            each(obj, function(value, index, list) {
                var computed = iterator ? iterator.call(context, value, index, list) : value;
                computed >= result.computed && (result = {value: value,computed: computed})
            });
            return result.value
        };
        _.min = function(obj, iterator, context) {
            if (!iterator && _.isArray(obj) && obj[0] === +obj[0] && obj.length < 65535) {
                return Math.min.apply(Math, obj)
            }
            if (!iterator && _.isEmpty(obj))
                return Infinity;
            var result = {computed: Infinity,value: Infinity};
            each(obj, function(value, index, list) {
                var computed = iterator ? iterator.call(context, value, index, list) : value;
                computed < result.computed && (result = {value: value,computed: computed})
            });
            return result.value
        };
        _.shuffle = function(obj) {
            var rand;
            var index = 0;
            var shuffled = [];
            each(obj, function(value) {
                rand = _.random(index++);
                shuffled[index - 1] = shuffled[rand];
                shuffled[rand] = value
            });
            return shuffled
        };
        var lookupIterator = function(value) {
            return _.isFunction(value) ? value : function(obj) {
                return obj[value]
            }
        };
        _.sortBy = function(obj, value, context) {
            var iterator = lookupIterator(value);
            return _.pluck(_.map(obj, function(value, index, list) {
                return {value: value,index: index,criteria: iterator.call(context, value, index, list)}
            }).sort(function(left, right) {
                    var a = left.criteria;
                    var b = right.criteria;
                    if (a !== b) {
                        if (a > b || a === void 0)
                            return 1;
                        if (a < b || b === void 0)
                            return -1
                    }
                    return left.index < right.index ? -1 : 1
                }), "value")
        };
        var group = function(obj, value, context, behavior) {
            var result = {};
            var iterator = lookupIterator(value || _.identity);
            each(obj, function(value, index) {
                var key = iterator.call(context, value, index, obj);
                behavior(result, key, value)
            });
            return result
        };
        _.groupBy = function(obj, value, context) {
            return group(obj, value, context, function(result, key, value) {
                (_.has(result, key) ? result[key] : result[key] = []).push(value)
            })
        };
        _.countBy = function(obj, value, context) {
            return group(obj, value, context, function(result, key) {
                if (!_.has(result, key))
                    result[key] = 0;
                result[key]++
            })
        };
        _.sortedIndex = function(array, obj, iterator, context) {
            iterator = iterator == null ? _.identity : lookupIterator(iterator);
            var value = iterator.call(context, obj);
            var low = 0, high = array.length;
            while (low < high) {
                var mid = low + high >>> 1;
                iterator.call(context, array[mid]) < value ? low = mid + 1 : high = mid
            }
            return low
        };
        _.toArray = function(obj) {
            if (!obj)
                return [];
            if (_.isArray(obj))
                return slice.call(obj);
            if (obj.length === +obj.length)
                return _.map(obj, _.identity);
            return _.values(obj)
        };
        _.size = function(obj) {
            if (obj == null)
                return 0;
            return obj.length === +obj.length ? obj.length : _.keys(obj).length
        };
        _.first = _.head = _.take = function(array, n, guard) {
            if (array == null)
                return void 0;
            return n != null && !guard ? slice.call(array, 0, n) : array[0]
        };
        _.initial = function(array, n, guard) {
            return slice.call(array, 0, array.length - (n == null || guard ? 1 : n))
        };
        _.last = function(array, n, guard) {
            if (array == null)
                return void 0;
            if (n != null && !guard) {
                return slice.call(array, Math.max(array.length - n, 0))
            } else {
                return array[array.length - 1]
            }
        };
        _.rest = _.tail = _.drop = function(array, n, guard) {
            return slice.call(array, n == null || guard ? 1 : n)
        };
        _.compact = function(array) {
            return _.filter(array, _.identity)
        };
        var flatten = function(input, shallow, output) {
            each(input, function(value) {
                if (_.isArray(value)) {
                    shallow ? push.apply(output, value) : flatten(value, shallow, output)
                } else {
                    output.push(value)
                }
            });
            return output
        };
        _.flatten = function(array, shallow) {
            return flatten(array, shallow, [])
        };
        _.without = function(array) {
            return _.difference(array, slice.call(arguments, 1))
        };
        _.uniq = _.unique = function(array, isSorted, iterator, context) {
            if (_.isFunction(isSorted)) {
                context = iterator;
                iterator = isSorted;
                isSorted = false
            }
            var initial = iterator ? _.map(array, iterator, context) : array;
            var results = [];
            var seen = [];
            each(initial, function(value, index) {
                if (isSorted ? !index || seen[seen.length - 1] !== value : !_.contains(seen, value)) {
                    seen.push(value);
                    results.push(array[index])
                }
            });
            return results
        };
        _.union = function() {
            return _.uniq(concat.apply(ArrayProto, arguments))
        };
        _.intersection = function(array) {
            var rest = slice.call(arguments, 1);
            return _.filter(_.uniq(array), function(item) {
                return _.every(rest, function(other) {
                    return _.indexOf(other, item) >= 0
                })
            })
        };
        _.difference = function(array) {
            var rest = concat.apply(ArrayProto, slice.call(arguments, 1));
            return _.filter(array, function(value) {
                return !_.contains(rest, value)
            })
        };
        _.zip = function() {
            var args = slice.call(arguments);
            var length = _.max(_.pluck(args, "length"));
            var results = new Array(length);
            for (var i = 0; i < length; i++) {
                results[i] = _.pluck(args, "" + i)
            }
            return results
        };
        _.object = function(list, values) {
            if (list == null)
                return {};
            var result = {};
            for (var i = 0, l = list.length; i < l; i++) {
                if (values) {
                    result[list[i]] = values[i]
                } else {
                    result[list[i][0]] = list[i][1]
                }
            }
            return result
        };
        _.indexOf = function(array, item, isSorted) {
            if (array == null)
                return -1;
            var i = 0, l = array.length;
            if (isSorted) {
                if (typeof isSorted == "number") {
                    i = isSorted < 0 ? Math.max(0, l + isSorted) : isSorted
                } else {
                    i = _.sortedIndex(array, item);
                    return array[i] === item ? i : -1
                }
            }
            if (nativeIndexOf && array.indexOf === nativeIndexOf)
                return array.indexOf(item, isSorted);
            for (; i < l; i++)
                if (array[i] === item)
                    return i;
            return -1
        };
        _.lastIndexOf = function(array, item, from) {
            if (array == null)
                return -1;
            var hasIndex = from != null;
            if (nativeLastIndexOf && array.lastIndexOf === nativeLastIndexOf) {
                return hasIndex ? array.lastIndexOf(item, from) : array.lastIndexOf(item)
            }
            var i = hasIndex ? from : array.length;
            while (i--)
                if (array[i] === item)
                    return i;
            return -1
        };
        _.range = function(start, stop, step) {
            if (arguments.length <= 1) {
                stop = start || 0;
                start = 0
            }
            step = arguments[2] || 1;
            var len = Math.max(Math.ceil((stop - start) / step), 0);
            var idx = 0;
            var range = new Array(len);
            while (idx < len) {
                range[idx++] = start;
                start += step
            }
            return range
        };
        _.bind = function(func, context) {
            if (func.bind === nativeBind && nativeBind)
                return nativeBind.apply(func, slice.call(arguments, 1));
            var args = slice.call(arguments, 2);
            return function() {
                return func.apply(context, args.concat(slice.call(arguments)))
            }
        };
        _.partial = function(func) {
            var args = slice.call(arguments, 1);
            return function() {
                return func.apply(this, args.concat(slice.call(arguments)))
            }
        };
        _.bindAll = function(obj) {
            var funcs = slice.call(arguments, 1);
            if (funcs.length === 0)
                funcs = _.functions(obj);
            each(funcs, function(f) {
                obj[f] = _.bind(obj[f], obj)
            });
            return obj
        };
        _.memoize = function(func, hasher) {
            var memo = {};
            hasher || (hasher = _.identity);
            return function() {
                var key = hasher.apply(this, arguments);
                return _.has(memo, key) ? memo[key] : memo[key] = func.apply(this, arguments)
            }
        };
        _.delay = function(func, wait) {
            var args = slice.call(arguments, 2);
            return setTimeout(function() {
                return func.apply(null, args)
            }, wait)
        };
        _.defer = function(func) {
            return _.delay.apply(_, [func, 1].concat(slice.call(arguments, 1)))
        };
        _.throttle = function(func, wait) {
            var context, args, timeout, result;
            var previous = 0;
            var later = function() {
                previous = new Date;
                timeout = null;
                result = func.apply(context, args)
            };
            return function() {
                var now = new Date;
                var remaining = wait - (now - previous);
                context = this;
                args = arguments;
                if (remaining <= 0) {
                    clearTimeout(timeout);
                    timeout = null;
                    previous = now;
                    result = func.apply(context, args)
                } else if (!timeout) {
                    timeout = setTimeout(later, remaining)
                }
                return result
            }
        };
        _.debounce = function(func, wait, immediate) {
            var timeout, result;
            return function() {
                var context = this, args = arguments;
                var later = function() {
                    timeout = null;
                    if (!immediate)
                        result = func.apply(context, args)
                };
                var callNow = immediate && !timeout;
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
                if (callNow)
                    result = func.apply(context, args);
                return result
            }
        };
        _.once = function(func) {
            var ran = false, memo;
            return function() {
                if (ran)
                    return memo;
                ran = true;
                memo = func.apply(this, arguments);
                func = null;
                return memo
            }
        };
        _.wrap = function(func, wrapper) {
            return function() {
                var args = [func];
                push.apply(args, arguments);
                return wrapper.apply(this, args)
            }
        };
        _.compose = function() {
            var funcs = arguments;
            return function() {
                var args = arguments;
                for (var i = funcs.length - 1; i >= 0; i--) {
                    args = [funcs[i].apply(this, args)]
                }
                return args[0]
            }
        };
        _.after = function(times, func) {
            if (times <= 0)
                return func();
            return function() {
                if (--times < 1) {
                    return func.apply(this, arguments)
                }
            }
        };
        _.keys = nativeKeys || function(obj) {
            if (obj !== Object(obj))
                throw new TypeError("Invalid object");
            var keys = [];
            for (var key in obj)
                if (_.has(obj, key))
                    keys[keys.length] = key;
            return keys
        };
        _.values = function(obj) {
            var values = [];
            for (var key in obj)
                if (_.has(obj, key))
                    values.push(obj[key]);
            return values
        };
        _.pairs = function(obj) {
            var pairs = [];
            for (var key in obj)
                if (_.has(obj, key))
                    pairs.push([key, obj[key]]);
            return pairs
        };
        _.invert = function(obj) {
            var result = {};
            for (var key in obj)
                if (_.has(obj, key))
                    result[obj[key]] = key;
            return result
        };
        _.functions = _.methods = function(obj) {
            var names = [];
            for (var key in obj) {
                if (_.isFunction(obj[key]))
                    names.push(key)
            }
            return names.sort()
        };
        _.extend = function(obj) {
            each(slice.call(arguments, 1), function(source) {
                if (source) {
                    for (var prop in source) {
                        obj[prop] = source[prop]
                    }
                }
            });
            return obj
        };
        _.pick = function(obj) {
            var copy = {};
            var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
            each(keys, function(key) {
                if (key in obj)
                    copy[key] = obj[key]
            });
            return copy
        };
        _.omit = function(obj) {
            var copy = {};
            var keys = concat.apply(ArrayProto, slice.call(arguments, 1));
            for (var key in obj) {
                if (!_.contains(keys, key))
                    copy[key] = obj[key]
            }
            return copy
        };
        _.defaults = function(obj) {
            each(slice.call(arguments, 1), function(source) {
                if (source) {
                    for (var prop in source) {
                        if (obj[prop] == null)
                            obj[prop] = source[prop]
                    }
                }
            });
            return obj
        };
        _.clone = function(obj) {
            if (!_.isObject(obj))
                return obj;
            return _.isArray(obj) ? obj.slice() : _.extend({}, obj)
        };
        _.tap = function(obj, interceptor) {
            interceptor(obj);
            return obj
        };
        var eq = function(a, b, aStack, bStack) {
            if (a === b)
                return a !== 0 || 1 / a == 1 / b;
            if (a == null || b == null)
                return a === b;
            if (a instanceof _)
                a = a._wrapped;
            if (b instanceof _)
                b = b._wrapped;
            var className = toString.call(a);
            if (className != toString.call(b))
                return false;
            switch (className) {
                case "[object String]":
                    return a == String(b);
                case "[object Number]":
                    return a != +a ? b != +b : a == 0 ? 1 / a == 1 / b : a == +b;
                case "[object Date]":
                case "[object Boolean]":
                    return +a == +b;
                case "[object RegExp]":
                    return a.source == b.source && a.global == b.global && a.multiline == b.multiline && a.ignoreCase == b.ignoreCase
            }
            if (typeof a != "object" || typeof b != "object")
                return false;
            var length = aStack.length;
            while (length--) {
                if (aStack[length] == a)
                    return bStack[length] == b
            }
            aStack.push(a);
            bStack.push(b);
            var size = 0, result = true;
            if (className == "[object Array]") {
                size = a.length;
                result = size == b.length;
                if (result) {
                    while (size--) {
                        if (!(result = eq(a[size], b[size], aStack, bStack)))
                            break
                    }
                }
            } else {
                var aCtor = a.constructor, bCtor = b.constructor;
                if (aCtor !== bCtor && !(_.isFunction(aCtor) && aCtor instanceof aCtor && _.isFunction(bCtor) && bCtor instanceof bCtor)) {
                    return false
                }
                for (var key in a) {
                    if (_.has(a, key)) {
                        size++;
                        if (!(result = _.has(b, key) && eq(a[key], b[key], aStack, bStack)))
                            break
                    }
                }
                if (result) {
                    for (key in b) {
                        if (_.has(b, key) && !size--)
                            break
                    }
                    result = !size
                }
            }
            aStack.pop();
            bStack.pop();
            return result
        };
        _.isEqual = function(a, b) {
            return eq(a, b, [], [])
        };
        _.isEmpty = function(obj) {
            if (obj == null)
                return true;
            if (_.isArray(obj) || _.isString(obj))
                return obj.length === 0;
            for (var key in obj)
                if (_.has(obj, key))
                    return false;
            return true
        };
        _.isElement = function(obj) {
            return !!(obj && obj.nodeType === 1)
        };
        _.isArray = nativeIsArray || function(obj) {
            return toString.call(obj) == "[object Array]"
        };
        _.isObject = function(obj) {
            return obj === Object(obj)
        };
        each(["Arguments", "Function", "String", "Number", "Date", "RegExp"], function(name) {
            _["is" + name] = function(obj) {
                return toString.call(obj) == "[object " + name + "]"
            }
        });
        if (!_.isArguments(arguments)) {
            _.isArguments = function(obj) {
                return !!(obj && _.has(obj, "callee"))
            }
        }
        if (typeof /./ !== "function") {
            _.isFunction = function(obj) {
                return typeof obj === "function"
            }
        }
        _.isFinite = function(obj) {
            return isFinite(obj) && !isNaN(parseFloat(obj))
        };
        _.isNaN = function(obj) {
            return _.isNumber(obj) && obj != +obj
        };
        _.isBoolean = function(obj) {
            return obj === true || obj === false || toString.call(obj) == "[object Boolean]"
        };
        _.isNull = function(obj) {
            return obj === null
        };
        _.isUndefined = function(obj) {
            return obj === void 0
        };
        _.has = function(obj, key) {
            return hasOwnProperty.call(obj, key)
        };
        _.noConflict = function() {
            root._ = previousUnderscore;
            return this
        };
        _.identity = function(value) {
            return value
        };
        _.times = function(n, iterator, context) {
            var accum = Array(n);
            for (var i = 0; i < n; i++)
                accum[i] = iterator.call(context, i);
            return accum
        };
        _.random = function(min, max) {
            if (max == null) {
                max = min;
                min = 0
            }
            return min + Math.floor(Math.random() * (max - min + 1))
        };
        var entityMap = {escape: {"&": "&amp;","<": "&lt;",">": "&gt;",'"': "&quot;","'": "&#x27;","/": "&#x2F;"}};
        entityMap.unescape = _.invert(entityMap.escape);
        var entityRegexes = {escape: new RegExp("[" + _.keys(entityMap.escape).join("") + "]", "g"),unescape: new RegExp("(" + _.keys(entityMap.unescape).join("|") + ")", "g")};
        _.each(["escape", "unescape"], function(method) {
            _[method] = function(string) {
                if (string == null)
                    return "";
                return ("" + string).replace(entityRegexes[method], function(match) {
                    return entityMap[method][match]
                })
            }
        });
        _.result = function(object, property) {
            if (object == null)
                return null;
            var value = object[property];
            return _.isFunction(value) ? value.call(object) : value
        };
        _.mixin = function(obj) {
            each(_.functions(obj), function(name) {
                var func = _[name] = obj[name];
                _.prototype[name] = function() {
                    var args = [this._wrapped];
                    push.apply(args, arguments);
                    return result.call(this, func.apply(_, args))
                }
            })
        };
        var idCounter = 0;
        _.uniqueId = function(prefix) {
            var id = ++idCounter + "";
            return prefix ? prefix + id : id
        };
        _.templateSettings = {evaluate: /<%([\s\S]+?)%>/g,interpolate: /<%=([\s\S]+?)%>/g,escape: /<%-([\s\S]+?)%>/g};
        var noMatch = /(.)^/;
        var escapes = {"'": "'","\\": "\\","\r": "r","\n": "n","	": "t","\u2028": "u2028","\u2029": "u2029"};
        var escaper = /\\|'|\r|\n|\t|\u2028|\u2029/g;
        _.template = function(text, data, settings) {
            var render;
            settings = _.defaults({}, settings, _.templateSettings);
            var matcher = new RegExp([(settings.escape || noMatch).source, (settings.interpolate || noMatch).source, (settings.evaluate || noMatch).source].join("|") + "|$", "g");
            var index = 0;
            var source = "__p+='";
            text.replace(matcher, function(match, escape, interpolate, evaluate, offset) {
                source += text.slice(index, offset).replace(escaper, function(match) {
                    return "\\" + escapes[match]
                });
                if (escape) {
                    source += "'+\n((__t=(" + escape + "))==null?'':_.escape(__t))+\n'"
                }
                if (interpolate) {
                    source += "'+\n((__t=(" + interpolate + "))==null?'':__t)+\n'"
                }
                if (evaluate) {
                    source += "';\n" + evaluate + "\n__p+='"
                }
                index = offset + match.length;
                return match
            });
            source += "';\n";
            if (!settings.variable)
                source = "with(obj||{}){\n" + source + "}\n";
            source = "var __t,__p='',__j=Array.prototype.join," + "print=function(){__p+=__j.call(arguments,'');};\n" + source + "return __p;\n";
            try {
                render = new Function(settings.variable || "obj", "_", source)
            } catch (e) {
                e.source = source;
                throw e
            }
            if (data)
                return render(data, _);
            var template = function(data) {
                return render.call(this, data, _)
            };
            template.source = "function(" + (settings.variable || "obj") + "){\n" + source + "}";
            return template
        };
        _.chain = function(obj) {
            return _(obj).chain()
        };
        var result = function(obj) {
            return this._chain ? _(obj).chain() : obj
        };
        _.mixin(_);
        each(["pop", "push", "reverse", "shift", "sort", "splice", "unshift"], function(name) {
            var method = ArrayProto[name];
            _.prototype[name] = function() {
                var obj = this._wrapped;
                method.apply(obj, arguments);
                if ((name == "shift" || name == "splice") && obj.length === 0)
                    delete obj[0];
                return result.call(this, obj)
            }
        });
        each(["concat", "join", "slice"], function(name) {
            var method = ArrayProto[name];
            _.prototype[name] = function() {
                return result.call(this, method.apply(this._wrapped, arguments))
            }
        });
        _.extend(_.prototype, {chain: function() {
            this._chain = true;
            return this
        },value: function() {
            return this._wrapped
        }})
    }.call(this)
}, {}],22: [function(require, module, exports) {
    var global = self;
    module.exports = function() {
        return global.WebSocket || global.MozWebSocket
    }
}, {}],23: [function(require, module, exports) {
    if (typeof window.requestAnimationFrame !== "function") {
        window.requestAnimationFrame = window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.oRequestAnimationFrame || window.msRequestAnimationFrame || function(callback) {
            setTimeout(callback, 1e3 / 60)
        }
    }
    Leap = require("../lib/index")
}, {"../lib/index": 10}]}, {}, [23]);
