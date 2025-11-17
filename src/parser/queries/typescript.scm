; Function declarations
(function_declaration
  name: (identifier) @function.name
  parameters: (formal_parameters) @function.params
  body: (statement_block) @function.body) @function.definition

; Arrow functions assigned to variables
(lexical_declaration
  (variable_declarator
    name: (identifier) @function.name
    value: (arrow_function
      parameters: (_) @function.params
      body: (_) @function.body))) @function.definition

; Method definitions in classes
(method_definition
  name: (property_identifier) @method.name
  parameters: (formal_parameters) @method.params
  body: (statement_block) @method.body) @method.definition

; Class declarations
(class_declaration
  name: (type_identifier) @class.name
  body: (class_body) @class.body) @class.definition

; Interface declarations
(interface_declaration
  name: (type_identifier) @interface.name
  body: (_) @interface.body) @interface.definition

; Type alias declarations
(type_alias_declaration
  name: (type_identifier) @type.name) @type.definition

; Enum declarations
(enum_declaration
  name: (identifier) @enum.name
  body: (enum_body) @enum.body) @enum.definition

; Variable declarations
(lexical_declaration
  (variable_declarator
    name: (identifier) @variable.name)) @variable.definition

; Const declarations
(lexical_declaration
  kind: "const"
  (variable_declarator
    name: (identifier) @constant.name)) @constant.definition

; Import statements
(import_statement
  source: (string) @import.source) @import.definition

; Export statements
(export_statement) @export.definition

; JSDoc comments
(comment) @comment
