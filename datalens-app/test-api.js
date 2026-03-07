const fs = require('fs');
const Papa = require('papaparse');

// Mini-implementación de AgentBus y los Agentes
class AgentBus {
    constructor() {
        this.listeners = new Map();
    }
    subscribe(agentId, listener) {
        if (!this.listeners.has(agentId)) {
            this.listeners.set(agentId, []);
        }
        this.listeners.get(agentId).push(listener);
    }
    publish(message) {
        const fullMessage = {
            ...message,
            id: Math.random().toString(36).substr(2, 9),
            timestamp: Date.now(),
        };
        if (fullMessage.to === '*') {
            this.listeners.forEach((agentListeners) => {
                agentListeners.forEach(l => l(fullMessage));
            });
        } else {
            const recipientListeners = this.listeners.get(fullMessage.to);
            if (recipientListeners) {
                recipientListeners.forEach(l => l(fullMessage));
            }
        }
    }
}

class AgentBase {
    constructor(id, bus) {
        this.id = id;
        this.bus = bus;
        this.bus.subscribe(this.id, this.handleMessage.bind(this));
    }
    send(to, type, payload) {
        this.bus.publish({ from: this.id, to, type, payload });
    }
}

class SchemaAgent extends AgentBase {
    constructor(bus) { super('schema-agent', bus); }
    handleMessage(message) {
        if (message.type === 'ANALYZE_SCHEMA') {
            const schema = this.inferSchema(message.payload.data);
            this.send(message.from, 'SCHEMA_ANALYZED', { schema });
        }
    }
    inferSchema(data) {
        if (!data || data.length === 0) return {};
        const sample = data[0];
        const schema = {};
        for (const key in sample) {
            const val = sample[key];
            if (!isNaN(Number(val))) {
                schema[key] = 'number';
            } else if (!isNaN(Date.parse(val))) {
                schema[key] = 'date';
            } else {
                schema[key] = 'string';
            }
        }
        return schema;
    }
}

class ReportAgent extends AgentBase {
    constructor(bus) { super('report-agent', bus); }
    handleMessage(message) {
        if (message.type === 'GENERATE_REPORT') {
            const reportConfig = this.generateBestReport(message.payload.data, message.payload.schema);
            this.send(message.from, 'REPORT_GENERATED', { reportConfig });
        }
    }
    generateBestReport(data, schema) {
        const numericCols = Object.keys(schema).filter(k => schema[k] === 'number');
        const categoryCols = Object.keys(schema).filter(k => schema[k] === 'string' || schema[k] === 'date');

        console.log("Cols", { numericCols, categoryCols });

        if (numericCols.length === 0) {
            return { type: 'table', data: data.slice(0, 100), message: "No se encontraron datos numéricos para graficar." };
        }

        const yAxis = numericCols[0];
        const xAxis = categoryCols.length > 0 ? categoryCols[0] : 'index';

        console.log("Axes", { xAxis, yAxis });

        let aggregatedData = [];
        try {
            if (xAxis !== 'index') {
                const grouped = data.reduce((acc, row) => {
                    const key = row[xAxis];
                    if (key == null) return acc;
                    const groupKey = String(key);
                    if (!acc[groupKey]) acc[groupKey] = 0;
                    const val = Number(row[yAxis]);
                    if (!isNaN(val)) acc[groupKey] += val;
                    return acc;
                }, {});

                aggregatedData = Object.entries(grouped)
                    .map(([name, value]) => ({ name, value }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 15);
            } else {
                aggregatedData = data.slice(0, 20).map((r, i) => {
                    const val = Number(r[yAxis]);
                    return { name: `Row ${i}`, value: isNaN(val) ? 0 : val };
                });
            }
        } catch (err) {
            console.error(err);
        }

        return { type: 'bar', xAxis: 'name', yAxis: 'value', data: aggregatedData, title: `Análisis de ${yAxis} por ${xAxis}` };
    }
}

class ManagerAgent extends AgentBase {
    constructor(bus) {
        super('manager-agent', bus);
        this.pendingRequests = new Map();
    }

    handleMessage(message) { } // Not used for this inline process

    async processData(data) {
        return new Promise((resolve) => {
            const sessionBus = new AgentBus();
            const schemaA = new SchemaAgent(sessionBus);
            const reportA = new ReportAgent(sessionBus);

            let discoveredSchema = null;

            sessionBus.subscribe('manager-session', (msg) => {
                console.log("Manager received:", msg.type);
                if (msg.type === 'SCHEMA_ANALYZED') {
                    discoveredSchema = msg.payload.schema;
                    sessionBus.publish({ from: 'manager-session', to: 'report-agent', type: 'GENERATE_REPORT', payload: { data, schema: discoveredSchema } });
                } else if (msg.type === 'REPORT_GENERATED') {
                    resolve({ schema: discoveredSchema, report: msg.payload.reportConfig });
                }
            });

            console.log("Publishing ANALYZE_SCHEMA");
            sessionBus.publish({ from: 'manager-session', to: 'schema-agent', type: 'ANALYZE_SCHEMA', payload: { data } });
        });
    }
}

const fileContent = fs.readFileSync('C:\\Users\\Keyrus\\OneDrive - Keyrus\\Escritorio\\antigravity test\\sample_sales_data.csv', 'utf8');

Papa.parse(fileContent, {
    header: true,
    skipEmptyLines: true,
    complete: async (results) => {
        const data = results.data;
        const bus = new AgentBus();
        const manager = new ManagerAgent(bus);
        console.log(`Processing ${data.length} rows...`);
        const result = await manager.processData(data);
        console.log("Result Report:", result.report.title);
        console.log("Result Data points:", result.report.data.length);
    }
});
