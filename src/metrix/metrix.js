/**
 * Constructs a new MetrixAnalytics
 * @constructor MetrixAnalytics
 * @param options.appId Metrix ApplicationID
 */
var MetrixAnalytics = function (options) {
    this.setAppId(options.appId);
    this.initialize(options);
};

function initMetrix(MetrixAnalytics) {
    const metrixSettingAndMonitoring = {
        urlEvents: 'https://analytics.metrix.ir/v3/engagement_event',
        timeOut: 5000,
        queueUnloadInterval: 10000,
        sessionExpirationTime: 60000,
        updateChunkNumber: 15,
        localQueueCapacity: 300
    };

    const ajaxState = {
        START: 'start',
        STOP: 'stop',
        UNUSED: 'unused'
    };

    const metrixEventTypes = {
        SESSION_START: "sessionStart",
        SESSION_STOP: "sessionStop",
        REVENUE: "revenue",
        CUSTOM: "custom",
        METRIX_MESSAGE: "metrixMessage"
    };

    const revenueCurrency = {
        IRR: "IRR",
        USD: "USD",
        EUR: "EUR"
    };

    const SDK_VERSION_NAME = "0.9.0";

    let MetrixAppId = null;
    let documentReferrer = null;
    let appInfo = null;
    let uniqueDeviceId = null;
    let storeName = null;
    let trackerToken = null;
    let referrer = null;
    let numberOfTries = 0;
    let locationPathName = document.location.pathname;
    let currentTabAjaxState = ajaxState.UNUSED;
    let lastSessionId = null;
    let lastSessionNumber = null;
    let browserPageInfo = null;
    let logEnabled = true;
    let userAttributes = {};

    let sessionIdListener = null;
    let userIdListener = null;

    let userIdListenerCalled = false;
    let sessionIdListenerCalled = true;

    const requestHeaders = {
        authentication: 'X-Application-Id',
        contentType: 'Content-Type',
        platform: 'MTX-Platform',
        SDKVersion: 'MTX-SDK-Version',
        ContentTypeValue: 'application/json;charset=UTF-8'
    };

    const localStorageKeys = {
        mainQueue: 'METRIX_LOCAL_OBJECT_QUEUE',
        sendingQueue: 'METRIX_LOCAL_SENDING_QUEUE',
        lastVisitTime: 'METRIX_LAST_VISIT_TIME',
        sessionDuration: 'METRIX_SESSION_DURATION',
        referrerPath: 'METRIX_REFERRER_PATH',
        sessionNumber: 'METRIX_SESSION_NUMBER',
        sessionId: 'METRIX_SESSION_ID',
        sessionIdLastReadTime: 'METRIX_LAST_SESSION_ID_READ_TIME',
        metrixId: 'METRIX_CHART_CLIENT_ID',
        lastDataSendTryTime: 'METRIX_LAST_DATA_SEND_TRY_TIME',
        lastDataSendTime: 'METRIX_LAST_DATA_SEND_TIME',
        ajaxState: 'METRIX_AJAX_STATE'
    };

    MetrixAnalytics.prototype.setAppId = function (id) {
        MetrixAppId = id;
    };

    MetrixAnalytics.prototype.setSessionIdListener = function (listener) {
        if (typeof listener === "function") {
            sessionIdListener = listener;
            let sessionId = metrixSession.getSessionId();
            if(sessionId && !sessionIdListenerCalled) {
                sessionIdListenerCalled = true;
                sessionIdListener(sessionId);
            }
        }
    };

    MetrixAnalytics.prototype.setUserIdListener = function (listener) {
        if (typeof listener === "function") {
            userIdListener = listener;
            let userId = clientId.getMetrixId();
            if(userId && !userIdListenerCalled) {
                userIdListenerCalled = true;
                userIdListener(userId);
            }
        }
    };

    /**
     * Initializes MetrixAnalytics. This is called internally by the constructor and does
     * not need to be called manually.
     */
    MetrixAnalytics.prototype.initialize = function (options) {
        appInfo = {
            package: options.packageName || document.location.hostname ? document.location.hostname : document.location.pathname,
            code: options.versionCode || 1,
            version: options.versionName || "1.0"
        };

        if (typeof options.uniqueDeviceId === 'string' || options.uniqueDeviceId instanceof String) {
            uniqueDeviceId = options.uniqueDeviceId;
        } else {
            uniqueDeviceId = '';
        }

        storeName = options.storeName;
        trackerToken = options.trackerToken;
        referrer = Utils.getQueryString(document.location.search);

        if (options.disableLogs) {
            logEnabled = false
        }

        metrixLogger.info("Initializing Metrix SDK", {
            "appInfo": appInfo,
            "uniqueDeviceId": uniqueDeviceId,
            "trackerToken": trackerToken,
            "storeName": storeName,
            "referrer": referrer
        });

        Utils.onDomLoaded(function () {
            retrieveBrowserData();
            metrixSession.updateLastVisitTime();
            metrixSession.generateNewSessionIfExpired();
        });
    };

    MetrixAnalytics.prototype.sendEvent = function (customName, customAttributes) {
        metrixSession.generateNewSessionIfExpired();

        if(!Utils.isString(customName)) {
            metrixLogger.error("Metrix, Invalid value was received for event name. The event will be ignored");
            return
        }

        customAttributes = customAttributes || {};

        if(!metrixEvent.validateAttributes(customAttributes)) {
            metrixLogger.error("Metrix, Invalid value was received for event attributes. The event will be ignored");
            return
        }

        let event = metrixEvent.makeBaseEventInfo(metrixEventTypes.CUSTOM);

        event.name = customName;
        event.attributes = customAttributes;
        event.metrics = {};

        addToQueue(event);
    };

    MetrixAnalytics.prototype.sendRevenue = function (customName, amount, currency, orderId) {
        metrixSession.generateNewSessionIfExpired();
        
        if(!Utils.isString(customName)) {
            metrixLogger.error("Metrix, Invalid value was received for event name. The event will be ignored");
            return
        }

        if(!Utils.isNumber(amount)) {
            metrixLogger.error("Metrix, Invalid value was received for revenue amount. The event will be ignored");
            return
        }

        if(orderId && !Utils.isString(orderId)) {
            metrixLogger.error("Metrix, Invalid value was received for revenue order id. The event will be ignored");
            return
        }

        currency = currency || revenueCurrency.IRR;
        if (currency !== revenueCurrency.IRR || currency !== revenueCurrency.EUR || currency !== revenueCurrency.EUR)
            currency = revenueCurrency.IRR;

        let event = metrixEvent.makeBaseEventInfo(metrixEventTypes.REVENUE);

        event.name = customName;
        event.revenue = amount;
        event.currency = currency;
        event.orderId = orderId;

        addToQueue(event);
    };

    MetrixAnalytics.prototype.addUserAttributes = function (customAttributes) {
        userAttributes = customAttributes || {};
    };

    let clientId = {};

    clientId.setMetrixId = function (value) {
        Utils.persistItem(localStorageKeys.metrixId, value);
    };

    clientId.getMetrixId = function () {
        return localStorage.getItem(localStorageKeys.metrixId);
    };

    let metrixEvent = {};

    metrixEvent.makeBaseEventInfo = function (eventType) {
        let event = {};

        event.type = eventType;
        event.id = Utils.genGuid();
        event.sessionId = metrixSession.getSessionId();
        event.sessionNum = metrixSession.getSessionNumber();
        event.timestamp = Utils.getCurrentTime();

        return event;
    }

    metrixEvent.sessionStop = function () {
        let event = this.makeBaseEventInfo(metrixEventTypes.SESSION_STOP);
        event.sessionId = lastSessionId;
        event.sessionNum = lastSessionNumber;
        event.duration = metrixSession.getSessionDuration();
        return event;
    };

    metrixEvent.sessionStart = function () {
        return this.makeBaseEventInfo(metrixEventTypes.SESSION_START);
    };

    metrixEvent.validateAttributes = function (attributes) {
        if(!Utils.isObject(attributes)) return false
    
        for(var key in attributes) {
            if(!Utils.isString(key) || !Utils.isString(attributes[key]))  return false
        }

        return true
    };

    let metrixQueue = {};

    metrixQueue.getMainQueue = function () {
        return JSON.parse(localStorage.getItem(localStorageKeys.mainQueue));
    };

    metrixQueue.setMainQueue = function (newQueue) {
        Utils.persistItem(localStorageKeys.mainQueue, JSON.stringify(newQueue));
    };

    metrixQueue.getSendingQueue = function () {
        return JSON.parse(localStorage.getItem(localStorageKeys.sendingQueue));
    };

    metrixQueue.setSendingQueue = function (newQueue) {
        Utils.persistItem(localStorageKeys.sendingQueue, JSON.stringify(newQueue));
    };

    metrixQueue.getLastDataSendTime = function () {
        let time = localStorage.getItem(localStorageKeys.lastDataSendTime);
        if (time != null) {
            return Number(time);
        }
        return null;
    };

    metrixQueue.setLastDataSendTime = function (time) {
        Utils.persistItem(localStorageKeys.lastDataSendTime, time);
    };

    metrixQueue.getLastDataSendTryTime = function () {
        let time = localStorage.getItem(localStorageKeys.lastDataSendTryTime);
        if (time != null) {
            return Number(time);
        }
        return null;
    };

    metrixQueue.setLastDataSendTryTime = function () {
        Utils.persistItem(localStorageKeys.lastDataSendTryTime, Utils.getCurrentTime().toString());
    };

    metrixQueue.breakHeavyQueue = function () {
        let storedQueue = this.getMainQueue() || [];
        const eventPriorities = [
            metrixEventTypes.CUSTOM,
            metrixEventTypes.REVENUE,
            metrixEventTypes.SESSION_START,
            metrixEventTypes.SESSION_STOP
        ];

        if (storedQueue.length > metrixSettingAndMonitoring.localQueueCapacity)
            this.setMainQueue(refineQueue(storedQueue));

        function refineQueue(inputQueue) {
            let newQueue = [];
            let initialIndex = 0;
            if (!clientId.getMetrixId()) {
                newQueue.push(inputQueue[0]);
                initialIndex = 1;
            }
            eventPriorities.forEach(function (type) {
                let i = initialIndex;
                while (i < inputQueue.length && newQueue.length < metrixSettingAndMonitoring.localQueueCapacity) {
                    if (inputQueue[i].type === type) {
                        newQueue.push(inputQueue[i]);
                    }
                    i++;
                }
            });
            return newQueue;
        }
    };

    metrixQueue.isQueueNotLargeEnoughToSend = function () {
        let storedQueue = this.getMainQueue() || [];
        return storedQueue.length <= metrixSettingAndMonitoring.updateChunkNumber;
    };

    metrixQueue.removeSendingState = function () {
        localStorage.removeItem(localStorageKeys.sendingQueue);
        currentTabAjaxState = ajaxState.STOP;
        Utils.persistItem(localStorageKeys.ajaxState, ajaxState.STOP);
    };

    // Three factors are considered:
    // * the time of last successful attempt
    // * size of queue
    // * ajax state
    metrixQueue.shouldAttemptSending = function () {
        let lastSendTime = this.getLastDataSendTime();
        if (lastSendTime != null) {
            let diff = Utils.getCurrentTime() - lastSendTime;
            if (diff < metrixSettingAndMonitoring.queueUnloadInterval && this.isQueueNotLargeEnoughToSend()) {
                return false;
            }

            // in some cases, (for example when the app is force-stopped), ajax state does not reset
            // here we reset sending state if needed
            let lastSendTryTime = this.getLastDataSendTryTime();
            if (lastSendTryTime != null) {
                let diffTry = Utils.getCurrentTime() - lastSendTryTime;
                if (diffTry > 3 * metrixSettingAndMonitoring.timeOut + metrixSettingAndMonitoring.queueUnloadInterval) {
                    this.removeSendingState();
                    numberOfTries = 0;
                }
            } else {
                this.removeSendingState();
                numberOfTries = 0;
            }
        }

        return localStorage.getItem(localStorageKeys.ajaxState) !== ajaxState.START;
    };

    metrixQueue.refreshMainQueue = function () {
        let storedQueue = this.getMainQueue() || [];
        let storedSendingQueue = this.getSendingQueue() || [];
        storedQueue.splice(0, storedSendingQueue.length);
        if (storedQueue.length === 0) {
            localStorage.removeItem(localStorageKeys.mainQueue);
        } else {
            this.setMainQueue(storedQueue);
        }
    };

    metrixQueue.updateSendingQueue = function () {
        let storedQueue = metrixQueue.getMainQueue() || [];
        metrixQueue.setSendingQueue(storedQueue.slice(0, metrixSettingAndMonitoring.updateChunkNumber));
    };

    function addToQueue(event) {
        // this check is necessary not to add a "session_end" event before adding the very first "session_start"
        if (event.sessionNum < 0) {
            return;
        }

        if (MetrixAppId != null) {
            let storedQueue = metrixQueue.getMainQueue() || [];
            storedQueue.push(event);
            metrixQueue.setMainQueue(storedQueue);

            metrixLogger.info("Metrix, A new Event was added to main queue", {"type": event.type});

            // If our queue is larger than the queueCapacity, the items with lower priority will be removed
            metrixQueue.breakHeavyQueue();
        }
    }

    // This function is called before attempting to send data in order to check numberOfTries
    // and set SendingQueue if an attempt should be made
    function initDataSending() {
        if (metrixQueue.getMainQueue() != null && metrixQueue.shouldAttemptSending()) {
            metrixQueue.setLastDataSendTryTime();
            if (numberOfTries < 3) {
                numberOfTries += 1;

                Utils.persistItem(localStorage.ajaxState, ajaxState.START);
                currentTabAjaxState = ajaxState.START;

                metrixQueue.updateSendingQueue();
                let parcel = createSendingParcel();
                if (parcel) {
                    attemptDataSending(parcel)
                }
            } else {
                numberOfTries = 0;
            }
        }
    }

    function createSendingParcel() {
        let events = metrixQueue.getSendingQueue()
        if (events == null || events.size === 0) {
            return null;
        }

        let parcel = {};
        parcel.events = events;

        let meta = {}

        meta.acquisition = {};
        meta.app = {
            "versionCode": appInfo.code,
            "versionName": appInfo.version,
            "packageName": appInfo.package,
            "sdkVersion": SDK_VERSION_NAME,
            "engineName": "web"
        }
        meta.referrer = {
            "available": true,
            "referrer": referrer
        }
        meta.location = {}

        let deviceInfo = userIdentificationInfo();
        meta.device = {
            "os": deviceInfo.os.name,
            "osVersionName": deviceInfo.os.version_name,
            "osVersion": deviceInfo.os.version,
            "deviceLang": deviceInfo.deviceLanguage,
            "screen": {
                "width": deviceInfo.screen.width,
                "height": deviceInfo.screen.height
            },
            "androidAdId": uniqueDeviceId
        };
        meta.sim = {};
        if (clientId.getMetrixId()){
            meta.user = {
                "userId": clientId.getMetrixId()
            };
        } else {
            meta.user = {};
        }
        
        meta.systemAttr = {};
        if (trackerToken) meta.systemAttr.trackerToken = trackerToken
        if (storeName) meta.systemAttr.store = storeName
        
        meta.userAttr = userAttributes;

        let connectionInfo = {};

        if (browserPageInfo !== null) {
            connectionInfo.protocol = browserPageInfo.document.url.protocol;
            connectionInfo.browserName = browserPageInfo.browser.name;
            connectionInfo.browserVersion = browserPageInfo.browser.version;
        }

        let ie = Utils.detectIE();
        if (ie) {
            connectionInfo.browserVersion = ie;
            if (ie > 11)
                connectionInfo.browserName = "MS Edge";
            if (ie <= 11)
                connectionInfo.browserName = "MSIE";
        }

        if (connectionInfo != null)
            meta.connection = connectionInfo;

        parcel.metaData = meta;
        return parcel;
    }

    function attemptDataSending(parcel) {
        metrixLogger.info("Metrix, attempting to send parcel", {"parcel": parcel});
        let http = new XMLHttpRequest();
        http.open("POST", metrixSettingAndMonitoring.urlEvents, true);

        http.setRequestHeader(requestHeaders.authentication, MetrixAppId);
        http.setRequestHeader(requestHeaders.contentType, requestHeaders.ContentTypeValue);
        http.setRequestHeader(requestHeaders.platform, "PWA");
        http.setRequestHeader(requestHeaders.SDKVersion, SDK_VERSION_NAME);
        http.timeout = metrixSettingAndMonitoring.timeOut;

        http.addEventListener("readystatechange", function () {
            if (this.readyState === 4) {
                if (this.status >= 200 && this.status <= 500) {
                    numberOfTries = 0;
                    // Update the time of data sending -> is used in isGoodTimeToSendData function
                    metrixQueue.setLastDataSendTime(Utils.getCurrentTime());
                    let shouldRefreshMainQueue = true;

                    try {
                        let receivedValue = JSON.parse(this.responseText);
                        // this should always be true
                        if ('userId' in receivedValue) {
                            let userId = receivedValue.userId;
                            clientId.setMetrixId(userId);

                            if (userIdListener && !userIdListenerCalled) {
                                userIdListenerCalled = true;
                                userIdListener(userId);
                            }

                        } else {
                            shouldRefreshMainQueue = false;
                        }
                    } catch (e) {
                        metrixLogger.error("error parsing http response", {"error": e});
                        shouldRefreshMainQueue = false;
                    }

                    if (this.status < 400 && shouldRefreshMainQueue) {
                        metrixQueue.refreshMainQueue();
                    }
                    metrixQueue.removeSendingState();

                } else {
                    metrixLogger.error("request failed", {"status code": this.status});
                    metrixQueue.removeSendingState();
                    initDataSending();
                }
            }
        });

        http.send(JSON.stringify(parcel));
    }

    let metrixSession = {};

    metrixSession.generateNewSession = function () {
        metrixLogger.info("Metrix, Generating a new session...");

        this.incrementSessionNumber();

        lastSessionNumber = this.getSessionNumber() - 1;
        lastSessionId = this.getSessionId();

        this.setSessionIdLastReadTime();
        this.renewSessionId();
        this.setDocumentReferrer();

        if (lastSessionNumber >= 0) {
            metrixSession.updateSessionDuration();
            addToQueue(metrixEvent.sessionStop());
        }
        metrixSession.resetSessionDuration();
        addToQueue(metrixEvent.sessionStart());

        sessionIdListenerCalled = false;
        if(sessionIdListener && !sessionIdListenerCalled) {
            sessionIdListener(this.getSessionId());
            sessionIdListenerCalled = true;
        }
    };

    metrixSession.updateLastVisitTime = function () {
        Utils.persistItem(localStorageKeys.lastVisitTime, Utils.getCurrentTime().toString());
    };

    metrixSession.getLastVisitTime = function () {
        return Number(localStorage.getItem(localStorageKeys.lastVisitTime));
    };

    metrixSession.resetSessionDuration = function () {
        Utils.persistItem(localStorageKeys.sessionDuration, "0");
        this.updateLastVisitTime();
    };

    metrixSession.getSessionDuration = function () {
        return Number(localStorage.getItem(localStorageKeys.sessionDuration));
    };

    metrixSession.updateSessionDuration = function () {
        let addedTime = Utils.getCurrentTime() - this.getLastVisitTime();
        let newDuration = this.getSessionDuration() + addedTime;

        Utils.persistItem(localStorageKeys.sessionDuration, newDuration.toString());
    };

    metrixSession.getSessionIdLastReadTime = function () {
        let value = localStorage.getItem(localStorageKeys.sessionIdLastReadTime);
        if (value != null) return Number(value);
        else return null
    };

    metrixSession.setSessionIdLastReadTime = function () {
        Utils.persistItem(localStorageKeys.sessionIdLastReadTime, Utils.getCurrentTime().toString());
    };

    metrixSession.sessionIdHasBeenRead = function () {
        return (this.getSessionIdLastReadTime() != null);
    };

    metrixSession.getSessionId = function () {
        return localStorage.getItem(localStorageKeys.sessionId);
    };

    metrixSession.renewSessionId = function () {
        let newSessionId = Utils.genGuid();
        Utils.persistItem(localStorageKeys.sessionId, newSessionId);
    };

    metrixSession.getSessionNumber = function () {
        if (this.sessionIdHasBeenRead()) {
            return Number(localStorage.getItem(localStorageKeys.sessionNumber));
        }
        return 0;
    };

    metrixSession.incrementSessionNumber = function () {
        if (this.sessionIdHasBeenRead()) {
            let count = this.getSessionNumber();
            count += 1;
            Utils.persistItem(localStorageKeys.sessionNumber, count.toString());
        } else {
            Utils.persistItem(localStorageKeys.sessionNumber, '0');
        }
    };

    metrixSession.getDocumentReferrer = function () {
        return localStorage.getItem(localStorageKeys.referrerPath);
    };

    metrixSession.setDocumentReferrer = function () {
        Utils.persistItem(localStorageKeys.referrerPath, document.referrer);
    };

    metrixSession.referrerHasNotChanged = function () {
        let referrerHostname = Utils.parseUrl(document.referrer).hostname;
        return window.location.hostname === referrerHostname ||
            document.referrer === this.getDocumentReferrer();
    };

    metrixSession.generateNewSessionIfExpired = function () {
        /**
         * The session is expired in two states.
         * 1. The difference of timestamp of the last event and now is more than session expireTime.
         * 2. The hostname of current page referrer was not equal to the host name of first-page referrer or page hostname.
         */

        if (this.sessionIdHasBeenRead() && this.getSessionId() != null && metrixSession.referrerHasNotChanged()) {
            let timeSinceLastEvent = Utils.getCurrentTime() - this.getSessionIdLastReadTime();
            if (timeSinceLastEvent < metrixSettingAndMonitoring.sessionExpirationTime) {
                this.setSessionIdLastReadTime();
                return;
            }
        }

        // If we are here, new session should be generated
        metrixSession.generateNewSession();
    };

    function userIdentificationInfo() {
        let value;
        if (browserPageInfo !== null) {
            value = {
                deviceLanguage: browserPageInfo.locale.language,
                platform: browserPageInfo.browser.platform,
                screen: {
                    height: browserPageInfo.screen.height,
                    width: browserPageInfo.screen.width,
                    color_depth: browserPageInfo.screen.colorDepth
                },
                os: {
                    name: browserPageInfo.browser.mobileOs,
                    version: 0,
                    version_name: browserPageInfo.browser.mobileOsVersion
                },
                cpuCore: browserPageInfo.screen.cpuCore,
                gpu: browserPageInfo.screen.gpu
            }
        }

        return value;
    };

    function retrieveBrowserData() {
        browserPageInfo = Env.getPageLoadData();
        browserPageInfo.url = Utils.parseUrl(document.location + '');
    }

    window.addEventListener('blur', function () {
        metrixSession.updateSessionDuration();
    });

    window.addEventListener('focus', function () {
        metrixSession.updateLastVisitTime();
    });

    window.addEventListener("beforeunload", function () {
        metrixSession.updateSessionDuration();
        if (currentTabAjaxState !== ajaxState.UNUSED) {
            metrixQueue.removeSendingState();
        }
    }, false);

    // Browser Detection
    let BrowserDetect = (function () {
        let BrowserDetect = {
            init: function () {
                this.browser = this.searchString(this.dataBrowser) || "An unknown browser";
                this.version = this.searchVersion(navigator.userAgent) ||
                    this.searchVersion(navigator.appVersion) ||
                    "an unknown version";
                this.OS = this.searchString(this.dataOS) || "an unknown OS";
                this.mobileOsVersion = this.searchOsVersion(navigator.userAgent);
                this.mobileOs = this.searchOs(navigator.userAgent);
            },
            searchOsVersion: function (uAgent) {
                let root = uAgent.substring(uAgent.indexOf("(") + 1, uAgent.indexOf(")"));
                let splits = root.split(";");
                let os;
                let version;
                for (let i = 0; i < splits.length; i++) {
                    os = splits[i].trim();
                    if (os.startsWith("Android")) {
                        version = os.split(" ")[1];

                    } else if (os.startsWith("CPU")) {
                        version = os.split(" ")[3];
                    }
                }
                return version;
            },
            searchOs: function (uAgent) {
                let root = uAgent.substring(uAgent.indexOf("(") + 1, uAgent.indexOf(")"));
                let splits = root.split(";");
                let os;
                let version;
                for (let i = 0; i < splits.length; i++) {
                    os = splits[i].trim();
                    if (os.toString().startsWith("Android")) {
                        version = os.split(" ")[0];

                    } else if (os.startsWith("CPU")) {
                        version = os.split(" ")[1];
                    }
                }
                return version;
            },
            searchString: function (data) {
                for (let i = 0; i < data.length; i++) {
                    let dataString = data[i].string;
                    let dataProp = data[i].prop;
                    this.versionSearchString = data[i].versionSearch || data[i].identity;
                    if (dataString) {
                        if (dataString.indexOf(data[i].subString) !== -1)
                            return data[i].identity;
                    } else if (dataProp)
                        return data[i].identity;
                }
            },
            searchVersion: function (dataString) {
                let index = dataString.indexOf(this.versionSearchString);
                if (index === -1) return;
                return parseFloat(dataString.substring(index + this.versionSearchString.length + 1));
            },
            dataBrowser: [{
                string: navigator.userAgent,
                subString: "Chrome",
                identity: "Chrome"
            }, {
                string: navigator.userAgent,
                subString: "OmniWeb",
                versionSearch: "OmniWeb/",
                identity: "OmniWeb"
            }, {
                string: navigator.vendor,
                subString: "Apple",
                identity: "Safari",
                versionSearch: "Version"
            }, {
                prop: window.opera,
                identity: "Opera",
                versionSearch: "Version"
            }, {
                string: navigator.vendor,
                subString: "iCab",
                identity: "iCab"
            }, {
                string: navigator.vendor,
                subString: "KDE",
                identity: "Konqueror"
            }, {
                string: navigator.userAgent,
                subString: "Firefox",
                identity: "Firefox"
            }, {
                string: navigator.vendor,
                subString: "Camino",
                identity: "Camino"
            }, { // for newer Netscape (6+)
                string: navigator.userAgent,
                subString: "Netscape",
                identity: "Netscape"
            }, {
                string: navigator.userAgent,
                subString: "MSIE",
                identity: "Explorer",
                versionSearch: "MSIE"
            }, {
                string: navigator.userAgent,
                subString: "Gecko",
                identity: "Mozilla",
                versionSearch: "rv"
            }, { // for older Netscape (4-)
                string: navigator.userAgent,
                subString: "Mozilla",
                identity: "Netscape",
                versionSearch: "Mozilla"
            }],
            dataOS: [{
                string: navigator.platform,
                subString: "Win",
                identity: "Windows"
            }, {
                string: navigator.platform,
                subString: "Mac",
                identity: "Mac"
            }, {
                string: navigator.userAgent,
                subString: "iPod",
                identity: "iPod"
            }, {
                string: navigator.userAgent,
                subString: "iPad",
                identity: "iPad"
            }, {
                string: navigator.userAgent,
                subString: "iPhone",
                identity: "iPhone"
            }, {
                string: navigator.platform,
                subString: "Linux",
                identity: "Linux"
            }]
        };
        BrowserDetect.init();
        return BrowserDetect;
    })();

    let Env = {};

    Env.getPageLoadData = function () {
        return {
            browser: Env.getBrowserData(),
            document: Env.getDocumentData(),
            screen: Env.getScreenData(),
            locale: Env.getLocaleData()
        };
    };

    Env.getBrowserData = function () {
        return ({
            ua: navigator.userAgent,
            name: BrowserDetect.browser,
            version: BrowserDetect.version,
            platform: BrowserDetect.OS,
            mobileOs: BrowserDetect.mobileOs || BrowserDetect.OS,
            mobileOsVersion: BrowserDetect.mobileOsVersion || "unknown version",
            language: navigator.language || navigator.userLanguage || navigator.systemLanguage,
            plugins: Env.getPluginsData()
        });
    };

    Env.getDocumentData = function () {
        return ({
            title: document.title,
            referrer: document.referrer || Utils.parseUrl(document.referrer) || undefined,
            url: Env.getUrlData()
        });
    };

    Env.getScreenData = function () {
        function getGraphicsCardName() {
            let canvas = document.createElement("canvas");
            let gl = canvas.getContext("experimental-webgl") || canvas.getContext("webgl");
            if (!gl) {
                return "Unknown";
            }
            let ext = gl.getExtension("WEBGL_debug_renderer_info");
            if (!ext) {
                return "Unknown";
            }

            return gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
        }

        return ({
            height: window.screen.height,
            width: window.screen.width,
            colorDepth: window.screen.colorDepth,
            cpuCore: navigator.hardwareConcurrency,
            gpu: getGraphicsCardName()
        });
    };

    Env.getLocaleData = function () {
        // "Mon Apr 15 2013 12:21:35 GMT-0600 (MDT)"
        let results = new RegExp('([A-Z]+-[0-9]+) \\(([A-Z]+)\\)').exec((new Date()).toString());
        let gmtOffset, timezone;

        if (results && results.length >= 3) {
            gmtOffset = results[1];
            timezone = results[2];
        }

        return ({
            language: navigator.systemLanguage || navigator.userLanguage || navigator.language,
            timezoneOffset: (new Date()).getTimezoneOffset(),
            gmtOffset: gmtOffset,
            timezone: timezone
        });
    };

    Env.getUrlData = function () {
        let l = document.location;
        documentReferrer = document.referrer;
        return ({
            hash: l.hash,
            host: l.host,
            hostname: l.hostname,
            pathname: locationPathName,
            protocol: l.protocol,
            referrer: documentReferrer,
            query: Utils.parseQueryString(l.search)
        });
    };

    Env.getPluginsData = function () {
        let plugins = [];
        let p = navigator.plugins;
        for (let i = 0; i < p.length; i++) {
            let pi = p[i];
            plugins.push({
                name: pi.name,
                description: pi.description,
                filename: pi.filename,
                version: pi.version,
                mimeType: (pi.length > 0) ? ({
                    type: pi[0].type,
                    description: pi[0].description,
                    suffixes: pi[0].suffixes
                }) : undefined
            });
        }
        return plugins;
    };

    let Utils = {};

    Utils.onDomLoaded = function (f) {
        if (document.body != null) f();
        else setTimeout(function () {
            this.onDomLoaded(f);
        }, 10);
    };

    Utils.getCurrentTime = function () {
        return Date.now();
    };

    Utils.getFormattedCurrentTime = function () {
        let current_datetime = new Date();
        return current_datetime.getUTCFullYear() + "-" + (current_datetime.getUTCMonth() + 1) + "-" + current_datetime.getUTCDate() + "T" + current_datetime.getUTCHours() + ":" + current_datetime.getUTCMinutes() + ":" + current_datetime.getUTCSeconds() + "." + current_datetime.getUTCMilliseconds() + "Z";
    };

    Utils.genGuid = function () {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16)
                .substring(1);
        }

        return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
            s4() + '-' + s4() + s4() + s4();
    };

    Utils.getQueryString = function (qs) {
        if (qs.length > 0) {
            return qs.charAt(0) === '?' ? qs.substring(1) : qs;
        }
        return null;
    };

    Utils.parseQueryString = function (qs) {
        let pairs = {};

        if (qs.length > 0) {
            let query = qs.charAt(0) === '?' ? qs.substring(1) : qs;

            if (query.length > 0) {
                let vars = query.split('&');
                for (let i = 0; i < vars.length; i++) {
                    if (vars[i].length > 0) {
                        let pair = vars[i].split('=');
                        try {
                            let name = decodeURIComponent(pair[0]);
                            pairs[name] = (pair.length > 1) ? decodeURIComponent(pair[1]) : 'true';
                        } catch (e) {
                        }
                    }
                }
            }
        }
        return pairs;
    };

    Utils.parseUrl = function (url) {
        let l = document.createElement("a");
        l.href = url;
        return {
            hash: l.hash,
            host: l.host,
            hostname: l.hostname,
            pathname: l.pathname,
            protocol: l.protocol,
            query: Utils.parseQueryString(l.search)
        };
    };

    Utils.detectIE = function () {
        let ua = window.navigator.userAgent;
        let msie = ua.indexOf('MSIE ');
        if (msie > 0) {
            return parseInt(ua.substring(msie + 5, ua.indexOf('.', msie)), 10);
        }
        let trident = ua.indexOf('Trident/');
        if (trident > 0) {
            let rv = ua.indexOf('rv:');
            return parseInt(ua.substring(rv + 3, ua.indexOf('.', rv)), 10);
        }
        let edge = ua.indexOf('Edge/');
        if (edge > 0) {
            return parseInt(ua.substring(edge + 5, ua.indexOf('.', edge)), 10);
        }
        return false;
    };

    Utils.isObject = function (param) {
        return Object.prototype.toString.call(param) === "[object Object]";
    };

    Utils.isString = function (param) {
        return typeof param === 'string' || param instanceof String;
    };

    Utils.isNumber = function (param) {
        return typeof param === 'number'
    };

    Utils.persistItem = function (key, value) {
        try {
            localStorage.setItem(key, value);
        } catch(e) {}
    };

    let metrixLogger = {};

    metrixLogger.log = function (message, obj = {}) {
        if (logEnabled) {
            console.log(message, obj);
        }
    };

    metrixLogger.info = function (message, obj = {}) {
        if (logEnabled) {
            console.info(message, obj);
        }
    };

    metrixLogger.debug = function (message, obj = {}) {
        if (logEnabled) {
            console.debug(message, obj);
        }
    };

    metrixLogger.warn = function (message, obj = {}) {
        if (logEnabled) {
            console.warn(message, obj);
        }
    };

    metrixLogger.error = function (message, obj = {}) {
        if (logEnabled) {
            console.error(message, obj);
        }
    };

    metrixLogger.trace = function (message, obj = {}) {
        if (logEnabled) {
            console.trace(message, obj);
        }
    };

    setInterval(initDataSending, metrixSettingAndMonitoring.queueUnloadInterval);

    return MetrixAnalytics;
}

var metrix = {};
let metrixInitialized = false;
let metrixInstance;
metrix.initialize = function (options) {
    if (!metrixInitialized) {
        metrixInitialized = true;
        initMetrix(MetrixAnalytics);
        metrixInstance = new MetrixAnalytics(options);
    }
    return metrixInstance;
}

export default metrix