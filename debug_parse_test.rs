use tree_sitter::{Parser, Query, QueryCursor};

fn main() {
    let mut parser = Parser::new();
    parser.set_language(tree_sitter_ic10::language()).unwrap();

    // Test both code snippets
    let test_get = "yield\nget r12 db 12\nbeqz r12 InitWaitLoop\n";
    let trinity = "InitWaitLoop:\n    yield\n    get r12 db 12\n    beqz r12 InitWaitLoop\n";

    println!("=== PARSING test_get.ic10 ===");
    test_parse(&mut parser, test_get);
    
    println!("\n=== PARSING TrinityFour snippet ===");
    test_parse(&mut parser, trinity);
}

fn test_parse(parser: &mut Parser, source: &str) {
    let tree = parser.parse(source, None).unwrap();
    
    println!("Root node: {:?}", tree.root_node());
    println!("\nTree S-expression:\n{}", tree.root_node().to_sexp());
    
    // Try the query
    let instruction_query = Query::new(
        tree_sitter_ic10::language(),
        "(instruction (operation) @op) @instruction",
    ).unwrap();
    
    let mut cursor = QueryCursor::new();
    let op_idx = instruction_query.capture_index_for_name("op").unwrap();
    let instruction_idx = instruction_query.capture_index_for_name("instruction").unwrap();
    
    println!("\n=== Query Captures ===");
    for (capture, _) in cursor.captures(&instruction_query, tree.root_node(), source.as_bytes()) {
        for cap in capture.captures {
            if cap.index == op_idx {
                let line = cap.node.start_position().row + 1;
                let text = cap.node.utf8_text(source.as_bytes()).unwrap();
                println!("Line {}: Operation = '{}'", line, text);
            } else if cap.index == instruction_idx {
                let line = cap.node.start_position().row + 1;
                let text = cap.node.utf8_text(source.as_bytes()).unwrap();
                println!("Line {}: Instruction = '{}'", line, text);
            }
        }
    }
}
