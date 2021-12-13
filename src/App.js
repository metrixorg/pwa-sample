import React from 'react';
import './App.css';
import Metrix from './metrix/metrix'

class App extends React.Component {
  constructor() {
      super();
      
      this.metrix = Metrix.initialize({
          appId: 'lyfyhfkyjkdzakn',
          storeName: 'GooglePlay'
      });

      this.metrix.addUserAttributes({
          "first": "second"
      })

      this.metrix.setUserIdListener(this.userIdCallback)
      this.metrix.setSessionIdListener(this.sessionIdCallback)
  }

  sessionIdCallback = (id) => {
      console.log("SessionId callback was called. Id: " + id)
  }

  userIdCallback = (id) => {
      console.log("UserId callback was called. Id: " + id)
  }

  sendEvent = () => {
      const attributes = {};
      attributes['name'] = 'Ali';

      this.metrix.sendEvent('ubgxo', attributes);
  };

  sendRevenue = () => {
      this.metrix.sendRevenue('qcwjb', 23, "IRR");
  };

  render() {
      return (
          <div className="App">
              <header className="App-header">
                  <hr/>
                  <button onClick={this.sendEvent}>  SendEvent </button>
                  <hr/>
                  <button onClick={this.sendRevenue}>  SendRevenue </button>
              </header>
          </div>
      );
  }
}

export default App;
