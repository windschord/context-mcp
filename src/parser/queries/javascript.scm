; Function declarations
(function_declaration
  name: (identifier) @function.name
  parameters: (formal_parameters) @function.params
  body: (statement_block) @function.body) @function.definition

; Function expressions assigned to variables
(variable_declaration
  (variable_declarator
    name: (identifier) @function.name
    value: (function_expression
      parameters: (formal_parameters) @function.params
      body: (statement_block) @function.body))) @function.definition

; Arrow functions assigned to variables
(variable_declaration
  (variable_declarator
    name: (identifier) @function.name
    value: (arrow_function
      parameters: (_) @function.params
      body: (_) @function.body))) @function.definition

; Method definitions
(method_definition
  name: (property_identifier) @method.name
  parameters: (formal_parameters) @method.params
  body: (statement_block) @method.body) @method.definition

; Class declarations
(class_declaration
  name: (identifier) @class.name
  body: (class_body) @class.body) @class.definition

; Variable declarations
(variable_declaration
  (variable_declarator
    name: (identifier) @variable.name)) @variable.definition

; Import statements
(import_statement
  source: (string) @import.source) @import.definition

; Export statements
(export_statement) @export.definition

; Comments
(comment) @comment
