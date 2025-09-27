#!/usr/bin/env node

/**
 * Simple UI Fill Watcher
 * Just run this and then test fills from the UI
 */

console.log('👀 Watching for UI fill attempts...');
console.log('Go ahead and create an order from the UI or terminal, then try to fill it.');
console.log('Press Ctrl+C to stop\n');

let lastOrderCount = 0;
let monitoring = true;

async function watchForFills() {
    try {
        const ordersResponse = await fetch('http://localhost:5173/api/orders');
        const ordersData = await ordersResponse.json();

        const currentOrderCount = ordersData.success ? (ordersData.data?.length || 0) : 0;

        if (currentOrderCount !== lastOrderCount) {
            console.log(`📊 Order count changed: ${lastOrderCount} → ${currentOrderCount}`);

            if (ordersData.success && ordersData.data && ordersData.data.length > 0) {
                console.log('📋 Current orders:');
                ordersData.data.forEach((order, i) => {
                    console.log(`   ${i}: ${order.orderId.substring(0, 8)}... (${order.sellTokenAmount} → ${order.buyTokenAmount})`);
                });
                console.log('\n🎯 Try clicking "Execute Local Fill" in the UI now!\n');
            } else {
                console.log('✅ No orders left - they may have been filled!\n');
            }

            lastOrderCount = currentOrderCount;
        }

        // If we detect a fill attempt by monitoring the fill endpoint
        if (currentOrderCount > 0 && ordersData.data) {
            for (const order of ordersData.data) {
                await checkForFillActivity(order.orderId);
            }
        }

    } catch (error) {
        console.log(`❌ Monitoring error: ${error.message}`);
    }
}

async function checkForFillActivity(orderId) {
    // This is a quick check to see if there's any activity
    // In a real scenario, we'd detect the actual fill request
    // For now, just log that we're watching this order
}

// Manual fill test function
async function testFillForOrder(orderId) {
    console.log(`\n🧪 Testing fill for order ${orderId}...`);

    try {
        const streamResponse = await fetch(`http://localhost:5173/api/fill/stream?orderId=${orderId}`);
        console.log(`📡 Stream status: ${streamResponse.status}`);

        if (!streamResponse.ok) {
            const errorText = await streamResponse.text();
            console.log(`❌ Stream error: ${errorText}`);
            return;
        }

        console.log('📋 Stream messages:');
        const reader = streamResponse.body.getReader();
        const decoder = new TextDecoder();
        let messageCount = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split(/\n/).filter(Boolean);

            for (const line of lines) {
                const message = line.replace(/^data: /, '');
                if (!message) continue;

                messageCount++;

                if (message.includes('[err]') || message.includes('Error')) {
                    console.log(`🚨 ERROR: ${message}`);
                } else if (message.includes('Insufficient')) {
                    console.log(`💰 BALANCE: ${message}`);
                } else if (message.includes('done:')) {
                    console.log(`🏁 DONE: ${message}`);
                } else if (message.includes('completed successfully')) {
                    console.log(`✅ SUCCESS: ${message}`);
                } else {
                    console.log(`ℹ️  ${message}`);
                }
            }
        }

        console.log(`\n📊 Test complete: ${messageCount} messages received\n`);

    } catch (error) {
        console.log(`❌ Test error: ${error.message}\n`);
    }
}

// Check initial state
console.log('🔍 Initial check...');
watchForFills();

// Monitor every 3 seconds
const interval = setInterval(() => {
    if (monitoring) watchForFills();
}, 3000);

// Handle user input for manual testing
process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', async (key) => {
    const keyStr = key.toString();

    if (keyStr === '\u0003') { // Ctrl+C
        console.log('\n👋 Stopping watcher...');
        monitoring = false;
        clearInterval(interval);
        process.exit(0);
    }

    if (keyStr === 't' || keyStr === 'T') {
        // Test fill for first available order
        try {
            const ordersResponse = await fetch('http://localhost:5173/api/orders');
            const ordersData = await ordersResponse.json();

            if (ordersData.success && ordersData.data && ordersData.data.length > 0) {
                await testFillForOrder(ordersData.data[0].orderId);
            } else {
                console.log('❌ No orders available to test');
            }
        } catch (error) {
            console.log(`❌ Test failed: ${error.message}`);
        }
    }
});

console.log('💡 Press "t" to manually test fill, Ctrl+C to exit');