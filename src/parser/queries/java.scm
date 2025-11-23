; Method declarations
(method_declaration
  name: (identifier) @method.name
  parameters: (formal_parameters) @method.params
  body: (block) @method.body) @method.definition

; Class declarations
(class_declaration
  name: (identifier) @class.name
  body: (class_body) @class.body) @class.definition

; Interface declarations
(interface_declaration
  name: (identifier) @interface.name
  body: (interface_body) @interface.body) @interface.definition

; Enum declarations
(enum_declaration
  name: (identifier) @enum.name
  body: (enum_body) @enum.body) @enum.definition

; Constructor declarations
(constructor_declaration
  name: (identifier) @method.name
  parameters: (formal_parameters) @method.params
  body: (constructor_body) @method.body) @method.definition

; Field declarations
(field_declaration
  declarator: (variable_declarator
    name: (identifier) @variable.name)) @variable.definition

; Constant declarations (static final fields)
(field_declaration
  (modifiers
    "static"
    "final")
  declarator: (variable_declarator
    name: (identifier) @constant.name)) @constant.definition

; Constant declarations (final static fields - reversed order)
(field_declaration
  (modifiers
    "final"
    "static")
  declarator: (variable_declarator
    name: (identifier) @constant.name)) @constant.definition

; Import declarations
(import_declaration
  (scoped_identifier) @import.name) @import.definition

; Package declaration
(package_declaration
  (scoped_identifier) @package.name)

; Annotations
(annotation
  name: (identifier) @annotation.name)

; Comments
(line_comment) @comment
(block_comment) @comment
