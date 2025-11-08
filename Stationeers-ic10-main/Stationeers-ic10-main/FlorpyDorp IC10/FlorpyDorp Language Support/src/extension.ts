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

// Removed dynamic example extraction from ProgrammableChip.cs (users won't have decompiled sources).
// Retaining static examples only.

// Helper function to get instruction examples
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

function getLSPIC10Configurations(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('ic10.lsp');
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    // Activate Notification through VSCode Notifications
    vscode.window.showInformationMessage('IC10 Language Server is now active!');


    const serverBinary = process.platform === "win32" ? "ic10lsp.exe" : "ic10lsp";

    // The server is implemented in the upstream language server
    const serverModule = context.asAbsolutePath(path.join('bin', serverBinary));

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
                    const missing = required.some(t => !lowerBlock.includes(t.replace(/\?/, '').toLowerCase()));
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
                        const longest = icBlocks.reduce((a, b) => (b.value.length > a.value.length ? b : a));
                        const filtered: any[] = [];
                        asArray.forEach((c, idx) => {
                            const isIc = icBlocks.some(b => b.idx === idx);
                            if (isIc && idx !== longest.idx) return;
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
        }
    };

    // Create the language client and start the client.
    const lc = new LanguageClient(
        'ic10',
        'IC10 Language Server',
        serverOptions,
        clientOptions
    )

    // Push the disposable to the context's subscriptions so that the
    // client can be deactivated on extension deactivation
    //context.subscriptions.push(disposable);
    lc.start().then(() => {
        context.subscriptions.push(lc);
        // Send initial diagnostics state to server
        const diagEnabled = vscode.workspace.getConfiguration().get('ic10.diagnostics.enabled') as boolean | undefined;
        const options: ExecuteCommandParams = {
            command: 'setDiagnostics',
            arguments: [diagEnabled ?? true]
        };
        lc.sendRequest('workspace/executeCommand', options);
    });

    // Initial config
    lc.sendNotification(DidChangeConfigurationNotification.type, { settings: getLSPIC10Configurations() });

    // Register configuration changes to sendNotification.
    vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
        if (e.affectsConfiguration('ic10.lsp')) {
            lc.sendNotification(DidChangeConfigurationNotification.type, { settings: getLSPIC10Configurations() });
        }
    })

    // Dynamic example extraction removed; using static examples only.

    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('ic10.lsp.restart', () => {
        vscode.window.showInformationMessage('Restarting IC10 Language Server...');
        lc.stop().then(() => lc.start());
    }    ));

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
        context.subscriptions.push(vscode.languages.registerInlayHintsProvider({ language: 'ic10', scheme: 'file' }, {
            provideInlayHints(document: vscode.TextDocument, range: vscode.Range, token: vscode.CancellationToken): vscode.InlayHint[] {
                const hints: vscode.InlayHint[] = [];
                for (let line = range.start.line; line <= range.end.line; line++) {
                    const text = document.lineAt(line).text;
                    // instruction at start (after whitespace)
                    const m = text.match(/^\s*([a-zA-Z][a-zA-Z0-9]*)\b(.*)$/);
                    if (!m) continue;
                    const opcode = m[1].toLowerCase();
                    let after = m[2];
                    // strip inline comment
                    const hashIdx = after.indexOf('#');
                    if (hashIdx >= 0) after = after.substring(0, hashIdx);
                    const sig = signatureMap[opcode];
                    if (!sig) continue;
                    const typed = after.trim().length === 0 ? [] : after.trim().split(/\s+/);
                    const parts = sig.split(/\s+/);
                    const remaining = parts.slice(Math.min(typed.length, parts.length)).join(' ');
                    if (remaining.length === 0) continue; // all operands filled
                    // Place the signature hint to the RIGHT of the typed operands (before inline comment).
                    const opStart = text.indexOf(m[1]) + m[1].length; // immediately after opcode token
                    let operandArea = after;
                    if (hashIdx >= 0) operandArea = after.substring(0, hashIdx);
                    operandArea = operandArea.replace(/[\t ]+$/,''); // trim trailing spaces before comment
                    const endIdx = opStart + operandArea.length;
                    const pos = new vscode.Position(line, endIdx);
                    const hint = new vscode.InlayHint(pos, ' ' + remaining, vscode.InlayHintKind.Parameter);
                    hints.push(hint);
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
        // Notify server to update immediately without restart
        const options: ExecuteCommandParams = {
            command: 'setDiagnostics',
            arguments: [nextVal]
        };
        lc.sendRequest('workspace/executeCommand', options);
    // Actively clear client-side squiggles when disabling to ensure immediate visual feedback
        if (!nextVal) {
            // The language client stores diagnostics internally; reuse its collection name or default
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
            // Restart the language server to ensure the client and server are in sync and
            // any server-side diagnostic state is rebuilt immediately.
            lc.stop().then(() => lc.start());
        } else {
            // Force a re-validation by sending didChangeConfiguration (server already re-runs diagnostics)
            lc.sendNotification(DidChangeConfigurationNotification.type, { settings: getLSPIC10Configurations() });
            // Restart server after enabling diagnostics so any suppressed state is cleared.
            lc.stop().then(() => lc.start());
        }
        vscode.window.showInformationMessage(`IC10 diagnostics ${nextVal ? 'enabled' : 'disabled'} (client + server sync).`);
    }));

}

// This method is called when your extension is deactivated
export function deactivate() { }
