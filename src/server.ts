import { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as z from 'zod/v4';
import { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { defaultEnvironment, run } from '@quri/squiggle-lang';

const getServer = () => {
    // Create an MCP server with implementation details
    const server = new McpServer(
        {
            name: 'squiggle',
            version: '1.0.0'
        },
        { capabilities: { logging: {} } }
    );

    // Register the run-squiggle tool
    server.registerTool(
        'run-squiggle',
        {
            description: 'Runs Squiggle code and returns the result.',
            inputSchema: {
                code: z.string().describe('The Squiggle code to run.'),
                render_summary: z.string().default("false").describe("If 'true', then the binding to 'summary' will be interpreted as an array of strings and be rendered into a single string output separated by newlines. Default 'false'.")
            }
        },
        async ({ code, render_summary }): Promise<CallToolResult> => {
            const codeExecution = await run(code);
            if (codeExecution.result.ok && codeExecution.result.value.bindings.get("summary") !== undefined && render_summary === "true") {
                const summaryValue = codeExecution.result.value.bindings.get("summary")!.value as any;
                const rendered = summaryValue._value.map((x: any) => x.value).join("\n");
                return {
                    content: [
                        {
                            type: 'text',
                            text: rendered
                        }
                    ]
                };
            }
            else if (codeExecution.result.ok) {
                return {
                    content: [
                        {
                            type: 'text',
                            text: codeExecution.result.value.bindings.entries().map(([name,value]) => name + ": " + JSON.stringify(value._value)).join("\n")
                        }
                    ]
                };
            } else {
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Error: "${codeExecution.result.value.toStringWithDetails()}`
                        }
                    ]
                };
            }
        }
    );

    // Create a simple resource at a fixed URI
    server.registerResource(
        'run-squiggle',
        'https://example.com/run-squiggle',
        { mimeType: 'text/plain' },
        async (): Promise<ReadResourceResult> => {
            return {
                contents: [
                    {
                        uri: 'https://example.com/run-squiggle',
                        text: 'normal(0, 1) * SampleSet.fromList([-3, 2,-1,1,2,3,3,3,4,9])',
                    }
                ]
            };
        }
    );
    return server;
};

const host = process.env["HOST"] ?? "localhost";
const app = createMcpExpressApp({ host: host });

app.post('/mcp', async (req: Request, res: Response) => {
    const server = getServer();
    try {
        const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined
        });
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        res.on('close', () => {
            console.log('Request closed');
            transport.close();
            server.close();
        });
    } catch (error) {
        console.error('Error handling MCP request:', error);
        if (!res.headersSent) {
            res.status(500).json({
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: 'Internal server error'
                },
                id: null
            });
        }
    }
});

app.get('/mcp', async (req: Request, res: Response) => {
    console.log('Received GET MCP request');
    res.writeHead(405).end(
        JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed.'
            },
            id: null
        })
    );
});

app.delete('/mcp', async (req: Request, res: Response) => {
    console.log('Received DELETE MCP request');
    res.writeHead(405).end(
        JSON.stringify({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed.'
            },
            id: null
        })
    );
});

// Start the server
const PORT = parseInt(process.env["PORT"] ?? "3000");
app.listen(PORT, error => {
    if (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
    console.log(`mcp-squiggle (Streamable HTTP Server) listening on port ${PORT} bound to ${host}`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down server...');
    process.exit(0);
});
