; Function definitions
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @function.name
    parameters: (parameter_list) @function.params)
  body: (compound_statement) @function.body) @function.definition

; Function declarations (prototypes)
(declaration
  declarator: (function_declarator
    declarator: (identifier) @function.name
    parameters: (parameter_list) @function.params)) @function.declaration

; Struct definitions
(struct_specifier
  name: (type_identifier) @struct.name
  body: (field_declaration_list) @struct.body) @struct.definition

; Enum definitions
(enum_specifier
  name: (type_identifier) @enum.name
  body: (enumerator_list) @enum.body) @enum.definition

; Typedef declarations
(type_definition
  declarator: (type_identifier) @type.name) @type.definition

; Variable declarations
(declaration
  declarator: (identifier) @variable.name) @variable.definition

; Macro definitions
(preproc_function_def
  name: (identifier) @macro.name
  parameters: (preproc_params) @macro.params) @macro.definition

(preproc_def
  name: (identifier) @macro.name) @macro.definition

; Include directives
(preproc_include
  path: (_) @include.path) @include.definition

; Comments
(comment) @comment

; Arduino special functions (setup, loop)
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @arduino.function
    (#match? @arduino.function "^(setup|loop)$")))
