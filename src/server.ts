import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as z from 'zod/v4';
import { run } from '@quri/squiggle-lang';

const server = new McpServer({
    name: 'squiggle',
    version: '0.1.0'
});

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

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
}

try {
    await main();
} catch (error) {
    console.error('Server error:', error);
    process.exit(1);
}
