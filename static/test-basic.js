// Basic test script to verify JavaScript loading
console.log('🧪 TEST-BASIC.JS: This script is loading and executing!');
console.log('🧪 TEST-BASIC.JS: Current time:', new Date().toISOString());
console.log('🧪 TEST-BASIC.JS: Document ready state:', document.readyState);

// Create a simple visible indicator
document.addEventListener('DOMContentLoaded', function() {
    console.log('🧪 TEST-BASIC.JS: DOM Content Loaded event fired');
    
    // Create a highly visible test element
    const testDiv = document.createElement('div');
    testDiv.id = 'jsLoadTest';
    testDiv.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #ff0000;
        color: white;
        padding: 20px;
        border-radius: 10px;
        font-family: monospace;
        font-size: 16px;
        font-weight: bold;
        z-index: 10000;
        border: 3px solid #fff;
        text-align: center;
    `;
    testDiv.innerHTML = `
        🧪 JAVASCRIPT IS WORKING!<br>
        <small>Time: ${new Date().toLocaleTimeString()}</small><br>
        <small>If you see this, JS files are loading</small>
    `;
    
    document.body.appendChild(testDiv);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (testDiv.parentNode) {
            testDiv.parentNode.removeChild(testDiv);
        }
    }, 5000);
});