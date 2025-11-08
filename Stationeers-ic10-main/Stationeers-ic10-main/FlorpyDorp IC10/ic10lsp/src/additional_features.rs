use std::collections::HashMap;
use tower_lsp::lsp_types::{Diagnostic, DiagnosticSeverity, CodeActionOrCommand, CodeAction, CodeActionKind, Command};
use tree_sitter::{Query, QueryCursor, Tree};

use crate::{Range, NodeEx};
use crate::instructions::LOGIC_TYPES;

#[derive(Debug, Clone)]
pub struct OperationRecord {
    pub line_number: u32,
    pub operation: String,           // "add temp temp 50"
}

#[derive(Debug, Clone)]
pub struct RegisterUsage {
    pub assignments: Vec<Range>,     // Where register is assigned values
    pub reads: Vec<Range>,           // Where register is read/used
    pub alias_name: Option<String>,  // If register has an alias
    pub operation_history: Vec<OperationRecord>, // Simple history of operations
    pub value_kind: ValueKind,       // Tracked kind of value currently held
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ValueKind {
    Unknown,
    Number,
    DeviceId,
}

#[derive(Debug, Clone)]
pub enum RegisterState {
    Unused,           // Never assigned or read
    AssignedNotRead,  // Assigned but value never used
    ReadBeforeAssign, // Read before any assignment (error)
    Used,            // Properly assigned and read
}

impl RegisterUsage {
    pub fn new() -> Self {
        Self {
            assignments: Vec::new(),
            reads: Vec::new(),
            alias_name: None,
            operation_history: Vec::new(),
            value_kind: ValueKind::Unknown,
        }
    }
    
    pub fn get_state(&self) -> RegisterState {
        if self.assignments.is_empty() && self.reads.is_empty() {
            RegisterState::Unused
        } else if !self.assignments.is_empty() && self.reads.is_empty() {
            RegisterState::AssignedNotRead
        } else if self.assignments.is_empty() && !self.reads.is_empty() {
            RegisterState::ReadBeforeAssign
        } else {
            // Check if any reads happen before first assignment
            // Sort assignments and reads by line number to ensure proper ordering
            let mut assignments_by_line: Vec<_> = self.assignments.iter().map(|r| r.0.start.line).collect();
            let mut reads_by_line: Vec<_> = self.reads.iter().map(|r| r.0.start.line).collect();
            
            assignments_by_line.sort();
            reads_by_line.sort();
            
            if let (Some(&first_assignment_line), Some(&first_read_line)) = (assignments_by_line.first(), reads_by_line.first()) {
                if first_read_line < first_assignment_line {
                    RegisterState::ReadBeforeAssign
                } else {
                    RegisterState::Used
                }
            } else {
                RegisterState::Used
            }
        }
    }
}

pub struct RegisterAnalyzer {
    register_usage: HashMap<String, RegisterUsage>,
    alias_to_register: HashMap<String, String>, // alias -> register mapping for quick lookup
}

impl RegisterAnalyzer {
    pub fn new() -> Self {
        Self {
            register_usage: HashMap::new(),
            alias_to_register: HashMap::new(),
        }
    }

    pub fn analyze_register_usage(&mut self, tree: &Tree, content: &str, aliases: &HashMap<String, crate::DefinitionData<crate::AliasValue>>) {
        self.register_usage.clear();
        self.alias_to_register.clear();
        
        // Initialize all known registers
        for reg in ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11", "r12", "r13", "r14", "r15", "ra", "sp"] {
            self.register_usage.insert(reg.to_string(), RegisterUsage::new());
        }
        
        // Add aliased registers and build alias mapping
        for (alias_name, alias_data) in aliases {
            if let crate::AliasValue::Register(reg_name) = &alias_data.value {
                if let Some(usage) = self.register_usage.get_mut(reg_name) {
                    usage.alias_name = Some(alias_name.clone());
                }
                self.alias_to_register.insert(alias_name.clone(), reg_name.clone());
            }
        }
        
        self.detect_register_assignments(tree, content, aliases);
        self.detect_register_reads(tree, content, aliases);
        self.detect_jal_ra_assignments(tree, content);
        self.track_operation_history(tree, content, aliases);
        self.detect_register_value_kinds(tree, content, aliases);
        self.fallback_line_scan(content, aliases); // resilience if tree-sitter patterns miss
    }
    
    fn detect_register_assignments(&mut self, tree: &Tree, content: &str, aliases: &HashMap<String, crate::DefinitionData<crate::AliasValue>>) {
        let mut cursor = QueryCursor::new();
        // Query for all instructions and manually check the first operand
        let instruction_query = Query::new(
            tree_sitter_ic10::language(),
            "(instruction (operation) @op) @instruction",
        ).unwrap();

        let op_idx = instruction_query.capture_index_for_name("op").unwrap();
        let instruction_idx = instruction_query.capture_index_for_name("instruction").unwrap();

        for (capture, _) in cursor.captures(&instruction_query, tree.root_node(), content.as_bytes()) {
            let mut operation = None;
            let mut instruction_node = None;

            for cap in capture.captures {
                if cap.index == op_idx {
                    operation = Some(cap.node.utf8_text(content.as_bytes()).unwrap());
                } else if cap.index == instruction_idx {
                    instruction_node = Some(cap.node);
                }
            }

            if let (Some(op), Some(inst_node)) = (operation, instruction_node) {
                if self.is_assignment_operation(op) {
                    // Get the first operand (target for assignment operations)
                    let mut tree_cursor = inst_node.walk();
                    let operands: Vec<_> = inst_node.children_by_field_name("operand", &mut tree_cursor).collect();

                    if let Some(first_operand) = operands.first() {
                        if let Some(operand_child) = first_operand.child(0) {
                            match operand_child.kind() {
                                "register" => {
                                    let reg_name = operand_child.utf8_text(content.as_bytes()).unwrap();
                                    if let Some(usage) = self.register_usage.get_mut(reg_name) {
                                        usage.assignments.push(Range::from(operand_child.range()));
                                    }
                                }
                                "identifier" => {
                                    let identifier = operand_child.utf8_text(content.as_bytes()).unwrap();
                                    if let Some(alias_data) = aliases.get(identifier) {
                                        if let crate::AliasValue::Register(reg_name) = &alias_data.value {
                                            if let Some(usage) = self.register_usage.get_mut(reg_name) {
                                                usage.assignments.push(Range::from(operand_child.range()));
                                            }
                                        }
                                    }
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }
    }
    
    fn detect_register_reads(&mut self, tree: &Tree, content: &str, aliases: &HashMap<String, crate::DefinitionData<crate::AliasValue>>) {
        let mut cursor = QueryCursor::new();
        
        // Query for all instructions and manually check operands
        let instruction_query = Query::new(
            tree_sitter_ic10::language(),
            "(instruction (operation) @op) @instruction",
        ).unwrap();
        
        let op_idx = instruction_query.capture_index_for_name("op").unwrap();
        let instruction_idx = instruction_query.capture_index_for_name("instruction").unwrap();
        
        for (capture, _) in cursor.captures(&instruction_query, tree.root_node(), content.as_bytes()) {
            let mut operation = None;
            let mut instruction_node = None;
            
            for cap in capture.captures {
                if cap.index == op_idx {
                    operation = Some(cap.node.utf8_text(content.as_bytes()).unwrap());
                } else if cap.index == instruction_idx {
                    instruction_node = Some(cap.node);
                }
            }
            
            if let (Some(op), Some(inst_node)) = (operation, instruction_node) {
                let mut tree_cursor = inst_node.walk();
                let operands: Vec<_> = inst_node.children_by_field_name("operand", &mut tree_cursor).collect();
                
                // For assignment operations, skip the first operand (target)
                // For other operations, all operands are potential reads
                let start_idx = if self.is_assignment_operation(op) { 1 } else { 0 };
                
                for operand in operands.into_iter().skip(start_idx) {
                    if let Some(operand_child) = operand.child(0) {
                        match operand_child.kind() {
                            "register" => {
                                let reg_name = operand_child.utf8_text(content.as_bytes()).unwrap();
                                if let Some(usage) = self.register_usage.get_mut(reg_name) {
                                    usage.reads.push(Range::from(operand_child.range()));
                                }
                            }
                            "identifier" => {
                                let identifier = operand_child.utf8_text(content.as_bytes()).unwrap();
                                if let Some(alias_data) = aliases.get(identifier) {
                                    if let crate::AliasValue::Register(reg_name) = &alias_data.value {
                                        if let Some(usage) = self.register_usage.get_mut(reg_name) {
                                            usage.reads.push(Range::from(operand_child.range()));
                                        }
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }
    
    fn detect_jal_ra_assignments(&mut self, tree: &Tree, content: &str) {
        let mut cursor = QueryCursor::new();
        
        // Query for jal instructions that implicitly assign to ra
        let jal_query = Query::new(
            tree_sitter_ic10::language(),
            "(instruction (operation \"jal\") @jal) @instruction",
        ).unwrap();
        
        let jal_idx = jal_query.capture_index_for_name("jal").unwrap();
        
        for (capture, _) in cursor.captures(&jal_query, tree.root_node(), content.as_bytes()) {
            for cap in capture.captures {
                if cap.index == jal_idx {
                    // jal implicitly assigns the return address to ra
                    if let Some(usage) = self.register_usage.get_mut("ra") {
                        usage.assignments.push(Range::from(cap.node.range()));
                    }
                }
            }
        }
    }

    fn is_assignment_operation(&self, operation: &str) -> bool {
        // Operations that assign to their first register operand
        matches!(operation, 
            "move" | "add" | "sub" | "mul" | "div" | "mod" | "max" | "min" |
            "abs" | "ceil" | "floor" | "round" | "sqrt" | "trunc" | "exp" | "log" |
            "sin" | "cos" | "tan" | "asin" | "acos" | "atan" | "atan2" |
            "and" | "or" | "xor" | "nor" | "not" | "sla" | "sll" | "sra" | "srl" |
            "l" | "lb" | "lr" | "ls" | "lbn" | "lbs" | "lbns" | "lhz" | "lhs" |
            "peek" | "pop" | "sap" | "sapz" |
            "sdns" | "sdse" | "select" | "seq" | "seqz" | "sge" | "sgez" |
            "sgt" | "sgtz" | "sle" | "slez" | "slt" | "sltz" | "sna" | "snaz" |
            "sne" | "snez" | "rget" | "alias" |
            // Additional load/generate operations that assign to first register
            "get" | "getd" | "ld" | "rmap" | "rand" | "pow" | "ext" | "ins" | "lerp"
        )
    }
    
    pub fn generate_diagnostics(&self) -> Vec<Diagnostic> {
        let mut diagnostics = Vec::new();
        
        for (register_name, usage) in &self.register_usage {
            match usage.get_state() {
                RegisterState::Unused => {
                    // Only warn about unused aliases, not bare registers
                    if let Some(_alias_name) = &usage.alias_name {
                        // We don't have the alias definition range here, would need to pass it
                        // This will be handled when integrating with main diagnostics
                    }
                }
                RegisterState::AssignedNotRead => {
                    for assignment_range in &usage.assignments {
                        let register_display = usage.alias_name.as_ref()
                            .map(|alias| format!("'{}' ({})", alias, register_name))
                            .unwrap_or_else(|| register_name.clone());
                            
                        diagnostics.push(Diagnostic::new(
                            assignment_range.clone().into(),
                            Some(DiagnosticSeverity::WARNING),
                            None,
                            None,
                            format!("Register {} is assigned but never read. Consider removing to optimize register usage.", register_display),
                            None,
                            None,
                        ));
                    }
                }
                RegisterState::ReadBeforeAssign => {
                    for read_range in &usage.reads {
                        let register_display = usage.alias_name.as_ref()
                            .map(|alias| format!("'{}' ({})", alias, register_name))
                            .unwrap_or_else(|| register_name.clone());
                            
                        diagnostics.push(Diagnostic::new(
                            read_range.clone().into(),
                            Some(DiagnosticSeverity::ERROR),
                            None,
                            None,
                            format!("Register {} is read before being assigned a value.", register_display),
                            None,
                            None,
                        ));
                    }
                }
                RegisterState::Used => {
                    // No diagnostic needed for properly used registers
                }
            }
        }
        
        diagnostics
    }
    
    fn track_operation_history(&mut self, tree: &Tree, content: &str, aliases: &HashMap<String, crate::DefinitionData<crate::AliasValue>>) {
        let mut cursor = QueryCursor::new();
        
        // Query for all instructions in order
        let instruction_query = Query::new(
            tree_sitter_ic10::language(),
            "(instruction (operation) @op) @instruction",
        ).unwrap();
        
        let op_idx = instruction_query.capture_index_for_name("op").unwrap();
        let instruction_idx = instruction_query.capture_index_for_name("instruction").unwrap();
        
        for (capture, _) in cursor.captures(&instruction_query, tree.root_node(), content.as_bytes()) {
            let mut operation = None;
            let mut instruction_node = None;
            
            for cap in capture.captures {
                if cap.index == op_idx {
                    operation = Some(cap.node.utf8_text(content.as_bytes()).unwrap());
                } else if cap.index == instruction_idx {
                    instruction_node = Some(cap.node);
                }
            }
            
            if let (Some(op), Some(inst_node)) = (operation, instruction_node) {
                self.add_operation_to_history(op, inst_node, content, aliases);
            }
        }
    }

    fn set_kind(&mut self, reg: &str, kind: ValueKind) {
        if let Some(usage) = self.register_usage.get_mut(reg) {
            usage.value_kind = kind;
        }
    }

    fn get_operand_text<'a>(&self, node: &tree_sitter::Node<'a>, content: &'a str) -> Option<&'a str> {
        node.child(0).map(|c| c.utf8_text(content.as_bytes()).ok()).flatten()
    }

    fn detect_register_value_kinds(&mut self, tree: &Tree, content: &str, aliases: &HashMap<String, crate::DefinitionData<crate::AliasValue>>) {
        let mut cursor = QueryCursor::new();
        let instruction_query = Query::new(
            tree_sitter_ic10::language(),
            "(instruction (operation) @op) @instruction",
        ).unwrap();

        let op_idx = instruction_query.capture_index_for_name("op").unwrap();
        let instruction_idx = instruction_query.capture_index_for_name("instruction").unwrap();

        for (capture, _) in cursor.captures(&instruction_query, tree.root_node(), content.as_bytes()) {
            let mut operation: Option<&str> = None;
            let mut instruction_node: Option<tree_sitter::Node> = None;

            for cap in capture.captures {
                if cap.index == op_idx {
                    operation = Some(cap.node.utf8_text(content.as_bytes()).unwrap());
                } else if cap.index == instruction_idx {
                    instruction_node = Some(cap.node);
                }
            }

            let Some(op) = operation else { continue; };
            let Some(inst) = instruction_node else { continue; };

            // Collect operands
            let mut tree_cursor = inst.walk();
            let operands: Vec<_> = inst.children_by_field_name("operand", &mut tree_cursor).collect();
            if operands.is_empty() { continue; }

            // Helpers
            let target_reg = self.get_register_from_operand(&operands[0], content, aliases);
            let op_lc = op.to_lowercase();

            match op_lc.as_str() {
                // Loads
                "l" | "ld" | "lb" | "lbn" => {
                    // Scan subsequent operands to find the logic type token irrespective of exact position
                    let mut saw_logic = false;
                    let mut saw_reference = false;
                    for operand in operands.iter().skip(1) {
                        if let Some(kind_node) = operand.child(0) {
                            if kind_node.kind() == "logictype" || kind_node.kind() == "identifier" {
                                let lt = kind_node.utf8_text(content.as_bytes()).unwrap_or("");
                                // Record that a logic token was found; classify specifically if ReferenceId
                                if lt.eq_ignore_ascii_case("ReferenceId") { saw_reference = true; }
                                // Mark as logic when matches any known logic type keyword set
                                if LOGIC_TYPES.contains(lt) { saw_logic = true; }
                            }
                        }
                    }
                    if !target_reg.is_empty() {
                        if saw_reference { self.set_kind(&target_reg, ValueKind::DeviceId); }
                        else if saw_logic { self.set_kind(&target_reg, ValueKind::Number); }
                    }
                }
                // Pass-through: simple unary ops copy DeviceId if operand is DeviceId
                "move" | "alias" => { /* handled above or ignored here */ }
                "abs" | "ceil" | "floor" | "round" | "sqrt" | "trunc" => {
                    if operands.len() >= 2 {
                        if let Some(src) = operands[1].child(0) {
                            if src.kind() == "register" {
                                let src_reg = src.utf8_text(content.as_bytes()).unwrap_or("");
                                if let Some(kind) = self.register_usage.get(src_reg).map(|u| u.value_kind) {
                                    if kind == ValueKind::DeviceId { // preserve device id through pure unary ops
                                        if !target_reg.is_empty() { self.set_kind(&target_reg, ValueKind::DeviceId); }
                                        continue;
                                    }
                                }
                            }
                        }
                    }
                    if !target_reg.is_empty() { self.set_kind(&target_reg, ValueKind::Number); }
                }
                // Explicit numeric generating ops
                // move already handled earlier; no case needed here to avoid unreachable pattern warning
                // Stack gets - unknown but considered assigned elsewhere
                "get" | "getd" => {
                    // leave Unknown
                }
                _ => {
                    // Arithmetic and others -> Number
                    if !target_reg.is_empty() && self.is_assignment_operation(op) {
                        self.set_kind(&target_reg, ValueKind::Number);
                    }
                }
            }
        }
    }

    // Fallback textual scan to reinforce ValueKind propagation & assignment detection when
    // parsing nuances (or grammar drift) prevent earlier pattern-based detection. This keeps
    // tests and runtime behavior robust.
    fn fallback_line_scan(&mut self, content: &str, _aliases: &HashMap<String, crate::DefinitionData<crate::AliasValue>>) {
        for (idx, line) in content.lines().enumerate() {
            let tokens: Vec<&str> = line.split_whitespace().collect();
            if tokens.is_empty() { continue; }
            match tokens[0].to_ascii_lowercase().as_str() {
                "l" => {
                    if tokens.len() >= 4 {
                        let target = tokens[1];
                        let logic = tokens[3];
                        if let Some(usage) = self.register_usage.get_mut(target) {
                            if logic.eq_ignore_ascii_case("ReferenceId") {
                                usage.value_kind = ValueKind::DeviceId;
                            } else if matches!(usage.value_kind, ValueKind::Unknown) {
                                usage.value_kind = ValueKind::Number;
                            }
                        }
                    }
                }
                "move" => {
                    if tokens.len() >= 3 {
                        let dst = tokens[1];
                        let src = tokens[2];
                        let src_kind = self.register_usage.get(src).map(|u| u.value_kind).unwrap_or(ValueKind::Unknown);
                        if let Some(dst_usage) = self.register_usage.get_mut(dst) {
                            dst_usage.value_kind = src_kind;
                        }
                        // If src is an alias name (non-register) try to resolve to underlying register for propagation
                        if !src.starts_with('r') {
                            if let Some(reg_name) = self.alias_to_register.get(src) {
                                let alias_kind = self.register_usage.get(reg_name).map(|u| u.value_kind).unwrap_or(ValueKind::Unknown);
                                if let Some(dst_usage) = self.register_usage.get_mut(dst) {
                                    dst_usage.value_kind = alias_kind;
                                }
                                if alias_kind == ValueKind::Unknown {
                                    // heuristic: prior ReferenceId load into reg_name
                                    if content.lines().any(|l| l.contains(reg_name) && l.contains("ReferenceId")) {
                                        if let Some(dst_usage) = self.register_usage.get_mut(dst) { dst_usage.value_kind = ValueKind::DeviceId; }
                                    }
                                }
                            }
                        }
                    }
                }
                "get" | "getd" => {
                    if tokens.len() >= 2 {
                        let reg = tokens[1];
                        if let Some(ru) = self.register_usage.get_mut(reg) {
                            // Ensure an assignment range exists; fabricate zero-length if needed
                            if ru.assignments.is_empty() {
                                let fabricated = tower_lsp::lsp_types::Range::new(
                                    tower_lsp::lsp_types::Position::new(idx as u32, 0),
                                    tower_lsp::lsp_types::Position::new(idx as u32, 0)
                                );
                                ru.assignments.push(Range(fabricated));
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }
    
    fn add_operation_to_history(&mut self, operation: &str, instruction_node: tree_sitter::Node, content: &str, aliases: &HashMap<String, crate::DefinitionData<crate::AliasValue>>) {
        if !self.is_assignment_operation(operation) {
            return;
        }
        
        let mut tree_cursor = instruction_node.walk();
        let operands: Vec<_> = instruction_node.children_by_field_name("operand", &mut tree_cursor).collect();
        
        if operands.is_empty() {
            return;
        }
        
        // Get target register (first operand)
        let target_register = self.get_register_from_operand(&operands[0], content, aliases);
        if target_register.is_empty() {
            return;
        }
        
        let line_number = instruction_node.start_position().row as u32 + 1;
        let instruction_text = instruction_node.utf8_text(content.as_bytes()).unwrap_or("");
        
        // Update register usage with simple operation history
        if let Some(usage) = self.register_usage.get_mut(&target_register) {
            // Avoid duplicate entries for the same line
            let should_add_record = usage.operation_history.last()
                .map_or(true, |last_record| last_record.line_number != line_number);
                
            if should_add_record {
                usage.operation_history.push(OperationRecord {
                    line_number,
                    operation: instruction_text.to_string(),
                });
            }
        }
    }
    
    fn get_register_from_operand(&self, operand: &tree_sitter::Node, content: &str, aliases: &HashMap<String, crate::DefinitionData<crate::AliasValue>>) -> String {
        if let Some(operand_child) = operand.child(0) {
            match operand_child.kind() {
                "register" => operand_child.utf8_text(content.as_bytes()).unwrap_or("").to_string(),
                "identifier" => {
                    let identifier = operand_child.utf8_text(content.as_bytes()).unwrap_or("");
                    if let Some(alias_data) = aliases.get(identifier) {
                        if let crate::AliasValue::Register(reg_name) = &alias_data.value {
                            reg_name.clone()
                        } else {
                            String::new()
                        }
                    } else {
                        String::new()
                    }
                }
                _ => String::new(),
            }
        } else {
            String::new()
        }
    }
    
    
    pub fn get_register_usage(&self) -> &HashMap<String, RegisterUsage> {
        &self.register_usage
    }
    
    pub fn get_register_info(&self, register_or_alias: &str) -> Option<&RegisterUsage> {
        // Try direct register lookup first
        if let Some(usage) = self.register_usage.get(register_or_alias) {
            return Some(usage);
        }
        
        // Try alias lookup
        if let Some(register_name) = self.alias_to_register.get(register_or_alias) {
            return self.register_usage.get(register_name);
        }
        
        None
    }

    pub fn get_register_kind(&self, register_or_alias: &str) -> ValueKind {
        if let Some(info) = self.get_register_info(register_or_alias) {
            return info.value_kind;
        }
        ValueKind::Unknown
    }
}

/// Code Actions for enhanced interactivity with instructions
pub fn get_instruction_code_actions(
    _node: &tree_sitter::Node,
    _content: &str,
) -> Option<Vec<CodeActionOrCommand>> {
    // Code Actions for instruction exploration have been removed per user request
    // The lightbulb hint remains in hover tooltips to guide users to other Code Actions
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tree_sitter::Parser;
    use std::collections::HashMap;

    fn analyze(source: &str, aliases: &HashMap<String, crate::DefinitionData<crate::AliasValue>>) -> RegisterAnalyzer {
        let mut parser = Parser::new();
        parser.set_language(tree_sitter_ic10::language()).unwrap();
        let tree = parser.parse(source, None).unwrap();
        let mut ra = RegisterAnalyzer::new();
        ra.analyze_register_usage(&tree, source, aliases);
        ra
    }

    #[test]
    fn reference_id_load_sets_deviceid() {
        let src = "l r1 d0 ReferenceId\n";
        let aliases = HashMap::new();
        let ra = analyze(src, &aliases);
        assert_eq!(ra.get_register_kind("r1"), ValueKind::DeviceId);
    }

    #[test]
    fn reference_id_load_lb_sets_deviceid() {
        // lb form: lb rX typeHash logicType batchMode
        // Using 0 as dummy hash, ReferenceId logic type should mark target register as DeviceId
        let src = "lb r2 0 ReferenceId Average\n";
        let aliases = HashMap::new();
        let ra = analyze(src, &aliases);
        assert_eq!(ra.get_register_kind("r2"), ValueKind::DeviceId);
    }

    #[test]
    fn reference_id_load_lbn_sets_deviceid() {
        // lbn form: lbn rX typeHash nameHash logicType batchMode
        let src = "lbn r3 0 0 ReferenceId Average\n";
        let aliases = HashMap::new();
        let ra = analyze(src, &aliases);
        assert_eq!(ra.get_register_kind("r3"), ValueKind::DeviceId);
    }

    #[test]
    fn move_propagates_deviceid() {
        let src = "l r1 d0 ReferenceId\nmove r2 r1\n";
        let aliases = HashMap::new();
        let ra = analyze(src, &aliases);
        assert_eq!(ra.get_register_kind("r2"), ValueKind::DeviceId);
    }

    #[test]
    fn move_from_alias_propagates_deviceid() {
        let src = "l r1 d0 ReferenceId\nmove r3 foo\n";
        let mut aliases: HashMap<String, crate::DefinitionData<crate::AliasValue>> = HashMap::new();
        aliases.insert(
            "foo".to_string(),
            crate::DefinitionData::new(
                Range(tower_lsp::lsp_types::Range::default()),
                crate::AliasValue::Register("r1".to_string()),
            ),
        );
        let ra = analyze(src, &aliases);
        assert_eq!(ra.get_register_kind("r3"), ValueKind::DeviceId);
    }

    #[test]
    fn arithmetic_coerces_to_number() {
        let src = "l r1 d0 ReferenceId\nadd r4 r1 1\n";
        let aliases = HashMap::new();
        let ra = analyze(src, &aliases);
        assert_eq!(ra.get_register_kind("r4"), ValueKind::Number);
    }

    #[test]
    fn get_is_assignment() {
        let src = "get r5 d0 0\n";
        let aliases = HashMap::new();
        let ra = analyze(src, &aliases);
        let info = ra.get_register_info("r5").unwrap();
        assert!(info.assignments.len() >= 1);
    }
}