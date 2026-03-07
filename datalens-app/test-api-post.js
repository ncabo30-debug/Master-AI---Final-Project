const http = require('http');

const data = JSON.stringify({
    data: [
        { Sale_ID: "1", Sale_Date: "2026-02-01", Quantity: "1" }
    ]
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/analyze',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

const req = http.request(options, res => {
    let body = '';
    console.log(`STATUS: ${res.statusCode}`);
    res.on('data', d => body += d);
    res.on('end', () => console.log('BODY:', body));
});

req.on('error', error => {
    console.error('Error in request:', error);
});

req.write(data);
req.end();
