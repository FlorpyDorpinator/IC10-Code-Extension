/**
 * IC10 Language Support Extension for Visual Studio Code
 * 
 * This extension provides comprehensive language support for the IC10 MIPS-like assembly
 * language used in the game Stationeers. It connects VSCode to the ic10lsp language server
 * and provides additional client-side enhancements.
 * 
 * Key Features:
 * - Language server client initialization and management
 * - Enhanced hover tooltips with game-style instruction signatures
 * - Smart completion filtering and formatting
 * - Diagnostic control (enable/disable syntax checking)
 * - Inlay hints for instruction parameters
 * - Command palette integration
 * 
 * Architecture:
 * - Communicates with the Rust-based ic10lsp language server via LSP
 * - Enhances server responses with client-side middleware
 * - Manages server lifecycle (start/stop/restart)
 * - Provides custom VS Code commands and UI features
 * 
 * @module extension
 */

// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as net from 'net';
import {
    DidChangeConfigurationNotification,
    LanguageClient,
    LanguageClientOptions,
    ServerOptions,
    StreamInfo,
    ExecuteCommandParams
} from 'vscode-languageclient/node';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Retrieves instruction examples for hover tooltips and documentation.
 * 
 * These examples provide users with practical usage patterns for common IC10
 * instructions. Each instruction includes 2-3 examples ranging from simple
 * to intermediate complexity.
 * 
 * @param instruction - The IC10 instruction name (e.g., 'add', 'l', 's')
 * @returns Array of example code strings with inline comments
 */
function getInstructionExamples(instruction: string): string[] {
    // Basic examples for common instructions - this could be expanded
    const examples: { [key: string]: string[] } = {
        'add': [
            'add r0 r1 r2      # Simple: r0 = r1 + r2',
            'add r7 r5 r6      # Total charge from both batteries',
            'add r10 r8 r9     # Total max power'
        ],
        'sub': [
            'sub r0 r1 r2      # Simple: r0 = r1 - r2',
            'sub currentRoomTemperature currentRoomTemperature 273.15',
            'sub temp temp 10  # temp = temp - 10'
        ],
        'mul': [
            'mul r0 r1 r2      # Simple: r0 = r1 * r2',
            'mul r3 r1 2       # PowerRequired in 1 second',
            'mul r15 r15 r14   # Temperature * TotalMoles'
        ],
        'l': [
            'l r0 d0 Temperature     # Simple: read temperature from device 0',
            'l currentRoomPressure gasSensor Pressure',
            'l leverState01 leverSwitch01 Open'
        ],
        's': [
            's d1 Setting r0         # Simple: set device 1 setting to r0',
            's pressureRegulator Setting targetPipePressure',
            's db Setting currentRoomPressure'
        ]
    };
    
    return examples[instruction.toLowerCase()] || [];
}

/**
 * Retrieves the IC10 LSP configuration from VS Code settings.
 * 
 * This includes settings like max_lines, max_columns, max_bytes, and other
 * language server configuration options that control diagnostics and validation.
 * 
 * @returns Configuration object with IC10 LSP settings
 */
function getLSPIC10Configurations(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('ic10.lsp');
}

// ============================================================================
// Extension Activation
// ============================================================================

/**
 * Called when the extension is activated (first time an IC10 file is opened).
 * 
 * This function:
 * 1. Sets up the language server connection (local binary or remote TCP)
 * 2. Registers middleware to enhance hover, completion, and diagnostic behavior
 * 3. Starts the language server client
 * 4. Registers custom commands (restart server, toggle diagnostics, etc.)
 * 5. Sets up configuration change listeners
 * 
 * @param context - The extension context provided by VS Code
 */
/**
 * Resolves VS Code variables in a string (e.g., ${workspaceFolder}, ${extensionPath})
 * 
 * @param str - String potentially containing VS Code variables
 * @param context - Extension context for resolving paths
 * @returns String with variables resolved to actual paths
 */
function resolveVariables(str: string, context: vscode.ExtensionContext): string {
    if (!str) return str;
    
    // Get workspace folder (use first workspace if multiple)
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    
    // Replace common VS Code variables
    return str
        .replace(/\$\{workspaceFolder\}/gi, workspaceFolder)
        .replace(/\$\{workspaceRoot\}/gi, workspaceFolder)
        .replace(/\$\{extensionPath\}/gi, context.extensionPath)
        .replace(/\$\{userHome\}/gi, process.env.HOME || process.env.USERPROFILE || '')
        .replace(/~/g, process.env.HOME || process.env.USERPROFILE || '');
}

export function activate(context: vscode.ExtensionContext) {

    // Activate Notification through VSCode Notifications
    vscode.window.showInformationMessage('IC10 Language Server is now active!');

    // Determine the correct binary name based on platform and architecture
    let serverBinary: string;
    if (process.platform === "win32") {
        serverBinary = "ic10lsp-win32.exe";
    } else if (process.platform === "linux") {
        serverBinary = "ic10lsp-linux";
    } else if (process.platform === "darwin") {
        // macOS - check for Apple Silicon (ARM64) vs Intel (x64)
        serverBinary = process.arch === "arm64" ? "ic10lsp-darwin-arm64" : "ic10lsp-darwin";
    } else {
        // Fallback for unknown platforms
        vscode.window.showErrorMessage(`IC10 LSP: Unsupported platform ${process.platform}. Please compile ic10lsp manually and set ic10.lsp.serverPath in settings.`);
        serverBinary = "ic10lsp";
    }
    
    // Allow overriding the server path to avoid copy/lock issues during development
    const serverOverride = vscode.workspace.getConfiguration('ic10.lsp').get('serverPath') as string | undefined;
    
    // Resolve VS Code variables in the server path (e.g., ${workspaceFolder})
    const resolvedServerOverride = serverOverride && serverOverride.trim().length > 0
        ? resolveVariables(serverOverride.trim(), context)
        : undefined;
    
    // The server is implemented in the upstream language server
    const serverModule = resolvedServerOverride || context.asAbsolutePath(path.join('bin', serverBinary));
    
    // Log the resolved server path for debugging
    console.log(`IC10 LSP: Server path resolved to: ${serverModule}`);
    
    // Verify server binary exists
    const fs = require('fs');
    if (!fs.existsSync(serverModule)) {
        const errorMsg = `IC10 Language Server binary not found at: ${serverModule}\n\n` +
            `If using a custom serverPath, ensure the path is correct and uses forward slashes or escaped backslashes.\n` +
            `You can use VS Code variables like \${workspaceFolder} for portable paths.`;
        vscode.window.showErrorMessage(errorMsg);
        console.error(`IC10 LSP: ${errorMsg}`);
    }

    const config = vscode.workspace.getConfiguration();

    const useRemoteLanguageServer = config.get('ic10.useRemoteLanguageServer') as boolean;

    let serverOptions: ServerOptions;

    if (useRemoteLanguageServer) {

        const remoteLanguageServerHost = config.get('ic10.remoteLanguageServerHost') as string;
        const remoteLanguageServerPort = config.get('ic10.remoteLanguageServerPort') as number;

        let connectionInfo = {
            host: remoteLanguageServerHost,
            port: remoteLanguageServerPort
        };
        serverOptions = () => {
            // Connect to language server via socket
            let socket = net.connect(connectionInfo);
            let result: StreamInfo = {
                writer: socket,
                reader: socket
            };
            return Promise.resolve(result);
        };
    }
    else {
        serverOptions = {
            run: { command: serverModule },
            debug: { command: serverModule },
        };
    }

    // Optionally prompt to switch to in-game color theme
    const forcePalette = vscode.workspace.getConfiguration().get('ic10.colors.forceGamePalette') as boolean;
    if (forcePalette) {
        const currentTheme = vscode.workspace.getConfiguration('workbench').get('colorTheme') as string | undefined;
        const targetTheme = 'IC10 In-Game Colors';
        if (currentTheme !== targetTheme) {
            vscode.window.showInformationMessage('Switch to IC10 In-Game Colors theme for authentic colors?', 'Switch', 'Later')
                .then((choice: string | undefined) => {
                    if (choice === 'Switch') {
                        vscode.workspace.getConfiguration('workbench').update('colorTheme', targetTheme, vscode.ConfigurationTarget.Global);
                    }
                });
        }
    }

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        // Register the server for IC10 MIPS-like language documents
        documentSelector: [
            { scheme: 'file', language: 'ic10' },
            { scheme: 'untitled', language: 'ic10' }
        ],
        // Use UTF-8 encoding for proper handling of special characters
        outputChannelName: 'IC10 Language Server',
        middleware: {
            provideHover: async (document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, next: any) => {
                const useGameStyle = vscode.workspace.getConfiguration().get('ic10.hover.useGameStyle') as boolean;
                if (!useGameStyle) {
                    return next(document, position, token);
                }

                const hover = await next(document, position, token);
                if (!hover) return hover;

                // If the server already provides an IC10 code block (game-style signature), keep it.
                // Only prepend a small fallback signature for a few opcodes when none is present.

                const asArray: any[] = Array.isArray(hover.contents) ? (hover.contents as any[]) : [hover.contents];

                // Utility: extract first ic10 code block contents if present
                const extractIc10Block = (): string | undefined => {
                    for (const c of asArray) {
                        if (typeof c === 'string') {
                            const m = c.match(/```ic10\n([\s\S]*?)```/i);
                            if (m) return m[1].trim();
                        } else if (c && typeof c === 'object') {
                            if ('language' in c && 'value' in c && typeof c.language === 'string') {
                                if ((c.language as string).toLowerCase() === 'ic10') {
                                    return (c as any).value.trim();
                                }
                            } else if (typeof (c as vscode.MarkdownString).value === 'string') {
                                const raw = (c as vscode.MarkdownString).value;
                                const m = raw.match(/```ic10\n([\s\S]*?)```/i);
                                if (m) return m[1].trim();
                            }
                        }
                    }
                    return undefined;
                };

                const existingBlock = extractIc10Block();
                let hasIc10Block = existingBlock !== undefined;
                let overridingIncomplete = false;

                // Try to detect opcode under cursor for a minimal fallback signature.
                const range = document.getWordRangeAtPosition(position);
                const opcode = range ? document.getText(range).trim().toLowerCase() : '';

                const fallback: Record<string, string> = {
                    'move': 'move r? a(r?|num)',
                    'add': 'add r? a(r?|num) b(r?|num)',
                    'sub': 'sub r? a(r?|num) b(r?|num)',
                    'mul': 'mul r? a(r?|num) b(r?|num)',
                    'div': 'div r? a(r?|num) b(r?|num)',
                    'mod': 'mod r? a(r?|num) b(r?|num)',
                    's': 's device(d?|r?|id) logicType r?',
                    'l': 'l r? device(d?|r?|id) logicType',
                    'ls': 'ls r? device(d?|r?|id) slotIndex logicSlotType',
                    'lr': 'lr r? device(d?|r?|id) reagentMode int',
                    'lb': 'lb r? deviceHash logicType batchMode',
                    'sb': 'sb deviceHash logicType r?',
                    'lbn': 'lbn r? deviceHash nameHash logicType batchMode',
                    'lbns': 'lbns r? deviceHash nameHash slotIndex logicSlotType batchMode',
                    'lbs': 'lbs r? deviceHash slotIndex logicSlotType batchMode',
                    'sbn': 'sbn deviceHash nameHash logicType r?',
                    'sbs': 'sbs deviceHash slotIndex logicSlotType r?'
                };

                let example = fallback[opcode];
                // Special-case: for logicType under cursor, ensure we treat ReferenceId and BestContactFilter like other logic tokens
                // by adding a tiny inline doc if server didn’t supply one due to identifier parsing.
                if (!example) {
                    const wordRange = document.getWordRangeAtPosition(position);
                    const word = wordRange ? document.getText(wordRange) : '';
                    if (/^(ReferenceId|BestContactFilter)$/i.test(word)) {
                        const md = new vscode.MarkdownString(`# \`${word}\` (logicType)`);
                        md.appendMarkdown(`\nUsed with l/lb/lbn to read or filter contacts; ReferenceId supports batch aggregators like Minimum/Maximum.`);
                        return new vscode.Hover([md, ...(Array.isArray(hover.contents) ? hover.contents as any[] : [hover.contents])], hover.range ?? range);
                    }
                }
                // Decide if we should override an existing (possibly minimal) ic10 block.
                if (hasIc10Block && existingBlock) {
                    // Decide completeness: if any required token for this opcode is missing (like deviceHash for lbn) then override.
                    const needsTokens: Record<string, string[]> = {
                        'lbn': ['deviceHash','nameHash','logicType','batchMode'],
                        'lbns': ['deviceHash','nameHash','slotIndex','logicSlotType','batchMode'],
                        'lbs': ['deviceHash','slotIndex','logicSlotType','batchMode'],
                        'lb': ['deviceHash','logicType','batchMode'],
                        'sbn': ['deviceHash','nameHash','logicType','r?'],
                        'sbs': ['deviceHash','slotIndex','logicSlotType','r?'],
                        'sb': ['deviceHash','logicType','r?'],
                        's': ['device','logicType','r?'],
                        'l': ['r?','device','logicType'],
                        'ls': ['r?','device','slotIndex','logicSlotType'],
                        'lr': ['r?','device','reagentMode','int'],
                        'move': ['r?','a(r?|num)'],
                        'add': ['r?','a(r?|num)','b(r?|num)']
                    };
                    const required = needsTokens[opcode] || [];
                    const lowerBlock = existingBlock.toLowerCase();
                    // Normalize by stripping '?' for comparison on both sides to avoid false negatives
                    const lowerBlockNormalized = lowerBlock.replace(/\?/g, '');
                    const missing = required.some(t => {
                        const tokenNorm = t.replace(/\?/g, '').toLowerCase();
                        return !lowerBlockNormalized.includes(tokenNorm);
                    });
                    if (!missing) {
                        return hover; // appears complete
                    }
                    hasIc10Block = false; // force override
                    overridingIncomplete = true;
                }
                // If server returned multiple ic10 signature blocks (duplicate/minimal variants), keep the most complete one
                if (hasIc10Block) {
                    const icBlocks: { idx: number; value: string }[] = [];
                    asArray.forEach((c, idx) => {
                        if (typeof c === 'string') {
                            const m = c.match(/```ic10\n([\s\S]*?)```/i);
                            if (m) icBlocks.push({ idx, value: m[1].trim() });
                        } else if (c && typeof c === 'object') {
                            if ('language' in c && 'value' in c && typeof (c as any).language === 'string' && ((c as any).language as string).toLowerCase() === 'ic10') {
                                icBlocks.push({ idx, value: (c as any).value.trim() });
                            } else if (typeof (c as vscode.MarkdownString).value === 'string') {
                                const raw = (c as vscode.MarkdownString).value;
                                const m = raw.match(/```ic10\n([\s\S]*?)```/i);
                                if (m) icBlocks.push({ idx, value: m[1].trim() });
                            }
                        }
                    });
                        if (icBlocks.length > 1) {
                            // Prefer the most descriptive (longest) signature; remove exact duplicates
                            const longest = icBlocks.reduce((a, b) => (b.value.length > a.value.length ? b : a));
                            const seenValues = new Set<string>();
                            const filtered: any[] = [];
                            asArray.forEach((c, idx) => {
                                const ic = icBlocks.find(b => b.idx === idx);
                                if (ic) {
                                    if (idx !== longest.idx) return; // keep only longest signature block
                                    if (seenValues.has(ic.value)) return; // remove duplicates
                                    seenValues.add(ic.value);
                                }
                                filtered.push(c);
                            });
                            return new vscode.Hover(filtered as any, hover.range ?? range);
                        }
                }

                if (!example) {
                    return hover; // No fallback enrichment available
                }

                // Convert existing contents to MarkdownString safely, preserving code blocks and text.
                const toMarkdown = (c: any): vscode.MarkdownString => {
                    if (typeof c === 'string') {
                        return new vscode.MarkdownString(c);
                    }
                    // vscode.MarkdownString
                    if (c && typeof (c as vscode.MarkdownString).value === 'string') {
                        return c as vscode.MarkdownString;
                    }
                    // MarkedString { language, value }
                    if (c && typeof c === 'object' && 'language' in c && 'value' in c) {
                        const lang = (c as { language: string }).language || '';
                        const val = (c as { value: string }).value || '';
                        return new vscode.MarkdownString('```' + lang + '\n' + val + '\n```');
                    }
                    return new vscode.MarkdownString('');
                };

                const newContents: (vscode.MarkdownString | string)[] = [];
                const head = new vscode.MarkdownString('```ic10\n' + example + '\n```');
                head.isTrusted = true;
                newContents.push(head);

                for (const c of asArray) {
                    // If overriding an incomplete existing ic10 block, skip that block to avoid duplicates
                    if (overridingIncomplete) {
                        if (typeof c === 'string' && /```ic10/i.test(c)) {
                            continue;
                        }
                        if (c && typeof c === 'object' && 'language' in c && (c as any).language && ((c as any).language as string).toLowerCase() === 'ic10') {
                            continue;
                        }
                    }
                    const md = toMarkdown(c);
                    if (md.value && md.value.trim().length > 0) {
                        newContents.push(md);
                    }
                }

                return new vscode.Hover(newContents, hover.range ?? range);
            },
            handleDiagnostics: (uri: vscode.Uri, diagnostics: vscode.Diagnostic[], next: (uri: vscode.Uri, diagnostics: vscode.Diagnostic[]) => void) => {
                const enabled = vscode.workspace.getConfiguration().get('ic10.diagnostics.enabled') as boolean;
                if (!enabled) {
                    // Suppress diagnostics when disabled
                    next(uri, []);
                    return;
                }
                next(uri, diagnostics);
            }
            ,
            // Ensure opcode completion inserts only the mnemonic (plus a space), preventing any ghost-signature text
            provideCompletionItem: async (
                document: vscode.TextDocument,
                position: vscode.Position,
                context: vscode.CompletionContext,
                token: vscode.CancellationToken,
                next: any
            ) => {
                const result = await next(document, position, context, token);
                const normalize = (item: vscode.CompletionItem): vscode.CompletionItem => {
                    // Only adjust likely opcodes (function kind and simple word labels)
                    const isWord = typeof item.label === 'string' && /^[a-z][a-z0-9]*$/.test(item.label as string);
                    if (item.kind === vscode.CompletionItemKind.Function && isWord) {
                        item.insertText = (item.label as string) + ' ';
                        item.textEdit = undefined; // avoid replacing ranges with signatures
                        item.additionalTextEdits = undefined;
                        item.command = undefined; // avoid auto-triggering snippets/actions
                        item.filterText = item.label as string;
                        item.detail = item.detail; // keep detail visible in UI
                    }
                    return item;
                };
                if (!result) return result;
                if (Array.isArray(result)) {
                    return result.map(normalize);
                }
                if ('items' in result && Array.isArray(result.items)) {
                    result.items = result.items.map(normalize);
                    return result;
                }
                return result;
            }
        }
    };

    // Create the language client and start the client.
    const lc = new LanguageClient(
        'ic10',
        'IC10 Language Server',
        serverOptions,
        clientOptions
    );

    let clientRegisteredWithContext = false;
    let clientRunning = false;
    let stopInFlight: Promise<void> | undefined;
    let pendingConfigPayload: { settings: any } | undefined;
    let pendingDiagnosticsState: boolean | undefined;

    const sendConfigPayload = (payload: { settings: any }) => {
        lc.sendNotification(DidChangeConfigurationNotification.type, payload).catch((err: unknown) => {
            console.error('Failed to sync IC10 configuration with the language server', err);
            pendingConfigPayload = payload;
        });
    };

    const sendDiagnosticsState = (enabled: boolean) => {
        const options: ExecuteCommandParams = {
            command: 'setDiagnostics',
            arguments: [enabled]
        };
        lc.sendRequest('workspace/executeCommand', options).catch((err: unknown) => {
            console.error('Failed to push diagnostics state to the language server', err);
            pendingDiagnosticsState = enabled;
        });
    };

    const flushPendingServerState = () => {
        if (pendingConfigPayload) {
            const payload = pendingConfigPayload;
            pendingConfigPayload = undefined;
            sendConfigPayload(payload);
        }
        if (pendingDiagnosticsState !== undefined) {
            const enabled = pendingDiagnosticsState;
            pendingDiagnosticsState = undefined;
            sendDiagnosticsState(enabled);
        }
    };

    const scheduleConfigSync = () => {
        const payload = { settings: getLSPIC10Configurations() };
        if (!clientRunning) {
            pendingConfigPayload = payload;
            return;
        }
        sendConfigPayload(payload);
    };

    const scheduleDiagnosticsSync = (enabled: boolean) => {
        pendingDiagnosticsState = enabled;
        if (!clientRunning) {
            return;
        }
        sendDiagnosticsState(enabled);
    };

    const startClient = async () => {
        if (!clientRegisteredWithContext) {
            context.subscriptions.push(lc);
            clientRegisteredWithContext = true;
        }
        try {
            await lc.start();
            clientRunning = true;
            flushPendingServerState();
        } catch (err) {
            vscode.window.showErrorMessage(`IC10 Language Server failed to start: ${err instanceof Error ? err.message : String(err)}`);
        }
    };

    const stopClient = async () => {
        if (stopInFlight) {
            return stopInFlight;
        }
        if (!clientRunning) {
            return;
        }
        clientRunning = false;
        stopInFlight = lc
            .stop()
            .catch((err: unknown) => {
                vscode.window.showErrorMessage(`Failed to stop IC10 Language Server: ${err instanceof Error ? err.message : String(err)}`);
                throw err;
            })
            .finally(() => {
                stopInFlight = undefined;
            });
        return stopInFlight;
    };

    const restartClient = async () => {
        await stopClient();
        await startClient();
    };

    const initialDiagnosticsEnabled = (vscode.workspace.getConfiguration().get('ic10.diagnostics.enabled') as boolean | undefined) ?? true;
    scheduleConfigSync();
    scheduleDiagnosticsSync(initialDiagnosticsEnabled);
    void startClient();

    // Register configuration changes to keep the server in sync.
    vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
        if (e.affectsConfiguration('ic10.lsp')) {
            scheduleConfigSync();
        }
        if (e.affectsConfiguration('ic10.diagnostics.enabled')) {
            const diag = (vscode.workspace.getConfiguration().get('ic10.diagnostics.enabled') as boolean | undefined) ?? true;
            scheduleDiagnosticsSync(diag);
        }
    });

    // Dynamic example extraction removed; using static examples only.

    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('ic10.lsp.restart', async () => {
        vscode.window.showInformationMessage('Restarting IC10 Language Server...');
        await restartClient();
    }));

    // Register ic10.lsp.version command
    context.subscriptions.push(vscode.commands.registerCommand('ic10.lsp.version', () => {
        // ExecuteCommandOptions
        const options: ExecuteCommandParams = {
            command: 'version',
            arguments: []
        };

        lc.sendRequest('workspace/executeCommand', options);
    }   ));

    // Register ic10.showRelated command
    context.subscriptions.push(vscode.commands.registerCommand('ic10.showRelated', async (instruction?: string) => {
        // If instruction not provided, try to get current word at cursor
        if (!instruction) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showInformationMessage('No active editor found');
                return;
            }
            
            const position = editor.selection.active;
            const range = editor.document.getWordRangeAtPosition(position);
            if (!range) {
                vscode.window.showInformationMessage('No instruction found at cursor');
                return;
            }
            
            instruction = editor.document.getText(range);
        }

        // Map of instruction to related instructions (simplified version for demo)
        const relatedInstructions: { [key: string]: string[] } = {
            'add': ['sub', 'mul', 'div', 'mod'],
            'sub': ['add', 'mul', 'div', 'mod'],
            'mul': ['add', 'sub', 'div', 'mod'],
            'div': ['add', 'sub', 'mul', 'mod'],
            'l': ['s', 'lb', 'sb', 'lr', 'ls', 'ld', 'sd'],
            's': ['l', 'lb', 'sb', 'lr', 'ls', 'ld', 'sd'],
            'beq': ['bne', 'blt', 'bgt', 'ble', 'bge', 'breq', 'beqz'],
            'bne': ['beq', 'blt', 'bgt', 'ble', 'bge', 'brne', 'bnez']
        };

    const related = instruction ? relatedInstructions[instruction.toLowerCase()] : undefined;
        if (!related || related.length === 0) {
            vscode.window.showInformationMessage(`No related instructions found for '${instruction}'`);
            return;
        }

        const selectedInstruction = await vscode.window.showQuickPick(
            related.map(instr => ({
                label: instr,
                description: `Related to ${instruction}`
            })),
            {
                placeHolder: `Instructions related to ${instruction}`,
                canPickMany: false
            }
        );

        if (selectedInstruction) {
            // Insert the selected instruction at cursor
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const position = editor.selection.active;
                editor.edit((editBuilder: vscode.TextEditorEdit) => {
                    editBuilder.insert(position, selectedInstruction.label);
                });
            }
        }
    }));

    // Inlay hints for instruction signatures (game-style inline guidance)
    if (vscode.workspace.getConfiguration().get('ic10.inlayHints.enabled')) {
        const signatureMap: Record<string,string> = {
            'move': 'r? a(r?|num)',
            'add': 'r? a(r?|num) b(r?|num)',
            'sub': 'r? a(r?|num) b(r?|num)',
            'mul': 'r? a(r?|num) b(r?|num)',
            'div': 'r? a(r?|num) b(r?|num)',
            'mod': 'r? a(r?|num) b(r?|num)',
            'l': 'r? device(d?|r?|id) logicType',
            's': 'device(d?|r?|id) logicType r?',
            'ls': 'r? device(d?|r?|id) slotIndex logicSlotType',
            'lr': 'r? device(d?|r?|id) reagentMode int',
            'lb': 'r? deviceHash logicType batchMode',
            'lbn': 'r? deviceHash nameHash logicType batchMode',
            'lbns': 'r? deviceHash nameHash slotIndex logicSlotType batchMode',
            'lbs': 'r? deviceHash slotIndex logicSlotType batchMode',
            'sb': 'deviceHash logicType r?',
            'sbn': 'deviceHash nameHash logicType r?',
            'sbs': 'deviceHash slotIndex logicSlotType r?'
        };

        // Derive signatures for control-flow opcodes without enumerating all variants.
        const computeSignature = (opcodeLower: string): string | undefined => {
            // Known directly
            if (signatureMap[opcodeLower]) return signatureMap[opcodeLower];
            // Jumps
            if (opcodeLower === 'j' || opcodeLower === 'jal') return 'label(r?|num)';
            // Branch family: default is three operands (a, b, label); *z variants use implicit zero (a, label)
            if (opcodeLower.startsWith('b')) {
                const twoOp = opcodeLower.endsWith('z');
                return twoOp ? 'a(r?|num) label(r?|num)' : 'a(r?|num) b(r?|num) label(r?|num)';
            }
            return undefined;
        };
            // Show dynamic inline hints for remaining operands as you type.
            context.subscriptions.push(vscode.languages.registerInlayHintsProvider({ language: 'ic10', scheme: 'file' }, {
                provideInlayHints(document: vscode.TextDocument, range: vscode.Range): vscode.InlayHint[] {
                    const hints: vscode.InlayHint[] = [];
                    for (let line = range.start.line; line <= range.end.line; line++) {
                        const text = document.lineAt(line).text;
                        const m = text.match(/^\s*([a-zA-Z][a-zA-Z0-9]*)\b(.*)$/);
                        if (!m) continue;
                        const opcode = m[1].toLowerCase();
                        const sig = signatureMap[opcode] ?? computeSignature(opcode);
                        if (!sig) continue;
                        // Truncate at comment
                        let after = m[2];
                        const commentIdx = after.indexOf('#');
                        const beforeComment = commentIdx >= 0 ? after.substring(0, commentIdx) : after;
                        // Tokenize what the user has already typed
                        const typedTokens = beforeComment.trim().length === 0 ? [] : beforeComment.trim().split(/\s+/);
                        const parts = sig.split(/\s+/);

                        // Let the LSP show the very first suffix after the opcode when nothing typed yet to avoid duplicate hints
                        if (typedTokens.length === 0) {
                            continue;
                        }

                        // Remove the slot currently being edited and show only the remaining ones to the right
                        const remaining = parts.slice(Math.min(typedTokens.length, parts.length));
                        if (remaining.length === 0) continue;

                        // Anchor the hint immediately after what the user has typed (before any comment)
                        const opcodeEnd = text.indexOf(m[1]) + m[1].length;
                        const typedSpan = beforeComment; // includes any spaces the user typed
                        const anchorCol = opcodeEnd + typedSpan.length;
                        const pos = new vscode.Position(line, Math.max(anchorCol, opcodeEnd));
                        // Emit one short hint per remaining token to avoid UI truncation of a long single hint
                        for (const token of remaining) {
                            const hint = new vscode.InlayHint(pos, ' ' + token, vscode.InlayHintKind.Parameter);
                            hints.push(hint);
                        }
                    }
                    return hints;
                }
            }));
    }

    // Register ic10.searchCategory command
    context.subscriptions.push(vscode.commands.registerCommand('ic10.searchCategory', async (category?: string) => {
        // Map of categories to instructions
        const categories: { [key: string]: string[] } = {
            'Arithmetic': ['add', 'sub', 'mul', 'div', 'mod', 'abs', 'sqrt'],
            'Device I/O': ['l', 's', 'lr', 'ls', 'ld', 'sd', 'ss'],
            'Batch Operations': ['lb', 'sb', 'lbn', 'lbs', 'sbn', 'sbs'],
            'Branching': ['beq', 'bne', 'blt', 'bgt', 'ble', 'bge', 'beqz', 'bnez'],
            'Control Flow': ['j', 'jr', 'jal'],
            'Comparison': ['slt', 'sgt', 'sle', 'sge', 'seq', 'sne'],
            'Logic': ['and', 'or', 'xor', 'nor']
        };

        if (!category) {
            // Show category picker first
            const selectedCategory = await vscode.window.showQuickPick(
                Object.keys(categories).map(cat => ({
                    label: cat,
                    description: `${categories[cat].length} instructions`
                })),
                {
                    placeHolder: 'Select instruction category',
                    canPickMany: false
                }
            );

            if (!selectedCategory) {
                return;
            }
            category = selectedCategory.label;
        }

    const instructions = category ? categories[category] : undefined;
        if (!instructions || instructions.length === 0) {
            vscode.window.showInformationMessage(`No instructions found in category '${category}'`);
            return;
        }

        const selectedInstruction = await vscode.window.showQuickPick(
            instructions.map((instr: string) => ({
                label: instr,
                description: `${category} instruction`
            })),
            {
                placeHolder: `${category} instructions`,
                canPickMany: false
            }
        );

        if (selectedInstruction) {
            // Insert the selected instruction at cursor
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const position = editor.selection.active;
                editor.edit((editBuilder: vscode.TextEditorEdit) => {
                    editBuilder.insert(position, selectedInstruction.label);
                });
            }
        }
    }));

    // Register ic10.showExamples command
    context.subscriptions.push(vscode.commands.registerCommand('ic10.showExamples', async (instruction?: string) => {
        // If instruction not provided, try to get current word at cursor
        if (!instruction) {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showInformationMessage('No active editor found');
                return;
            }
            
            const position = editor.selection.active;
            const range = editor.document.getWordRangeAtPosition(position);
            if (!range) {
                vscode.window.showInformationMessage('No instruction found at cursor');
                return;
            }
            
            instruction = editor.document.getText(range);
        }

        // Show examples in an information message (could be enhanced to use a webview)
    const examples = getInstructionExamples(instruction!);
        if (examples.length === 0) {
            vscode.window.showInformationMessage(`No examples found for instruction '${instruction}'`);
            return;
        }

        // For now, show examples in a simple information dialog
        // In a more advanced implementation, this could show in a dedicated panel
        const exampleText = examples.join('\n');
        vscode.window.showInformationMessage(
            `Examples for ${instruction}:\n\n${exampleText}`,
            { modal: false }
        );
    }));

    // Toggle diagnostics on/off (force refresh by restarting client to clear stale squiggles immediately)
    context.subscriptions.push(vscode.commands.registerCommand('ic10.toggleDiagnostics', async () => {
        const configuration = vscode.workspace.getConfiguration();
        const current = configuration.get('ic10.diagnostics.enabled') as boolean | undefined;
        const nextVal = !(current ?? true);
        await configuration.update('ic10.diagnostics.enabled', nextVal, vscode.ConfigurationTarget.Workspace);
        scheduleDiagnosticsSync(nextVal);
        // Actively clear client-side squiggles when disabling to ensure immediate visual feedback
        if (!nextVal) {
            const collectionName = (lc as any)?._clientOptions?.diagnosticCollectionName;
            const diagCollection = collectionName
                ? vscode.languages.createDiagnosticCollection(collectionName)
                : vscode.languages.createDiagnosticCollection();
            for (const doc of vscode.workspace.textDocuments) {
                if (doc.languageId === 'ic10') {
                    diagCollection.set(doc.uri, []);
                }
            }
            diagCollection.dispose();
        } else {
            // Force a re-validation when diagnostics are re-enabled.
            scheduleConfigSync();
        }
        await restartClient();
        vscode.window.showInformationMessage(`IC10 diagnostics ${nextVal ? 'enabled' : 'disabled'} (client + server sync).`);
    }));

    // Suppress all register diagnostics by adding @ignore directive
    context.subscriptions.push(vscode.commands.registerCommand('ic10.suppressAllRegisterDiagnostics', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'ic10') {
            vscode.window.showInformationMessage('No active IC10 file');
            return;
        }

        const uri = editor.document.uri.toString();
        const options: ExecuteCommandParams = {
            command: 'ic10.suppressAllRegisterDiagnostics',
            arguments: [uri]
        };

        try {
            await lc.sendRequest('workspace/executeCommand', options);
            vscode.window.showInformationMessage('Added ignore directive for all register diagnostics');
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to suppress register diagnostics: ${err instanceof Error ? err.message : String(err)}`);
        }
    }));

    // Toggle between Stationeers theme and user's previous theme
    context.subscriptions.push(vscode.commands.registerCommand('ic10.toggleStationeersTheme', async () => {
        const config = vscode.workspace.getConfiguration();
        const currentTheme = config.get<string>('workbench.colorTheme');
        const stationeersTheme = 'Stationeers Dark';
        
        // Get or set the stored previous theme
        const previousTheme = context.globalState.get<string>('ic10.previousTheme');
        
        if (currentTheme === stationeersTheme) {
            // Switch back to previous theme (or default if none stored)
            const targetTheme = previousTheme || 'Dark+ (default dark)';
            await config.update('workbench.colorTheme', targetTheme, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`Switched to ${targetTheme}`);
        } else {
            // Store current theme and switch to Stationeers
            await context.globalState.update('ic10.previousTheme', currentTheme);
            await config.update('workbench.colorTheme', stationeersTheme, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('Switched to Stationeers Dark theme');
        }
    }));

}

// This method is called when your extension is deactivated
export function deactivate() { }
