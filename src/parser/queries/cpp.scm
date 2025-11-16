; Function definitions
(function_definition
  declarator: (function_declarator
    declarator: (identifier) @function.name
    parameters: (parameter_list) @function.params)
  body: (compound_statement) @function.body) @function.definition

; Method definitions (inside class)
(function_definition
  declarator: (function_declarator
    declarator: (qualified_identifier
      name: (identifier) @method.name)
    parameters: (parameter_list) @method.params)
  body: (compound_statement) @method.body) @method.definition

; Class definitions
(class_specifier
  name: (type_identifier) @class.name
  body: (field_declaration_list) @class.body) @class.definition

; Struct definitions
(struct_specifier
  name: (type_identifier) @struct.name
  body: (field_declaration_list) @struct.body) @struct.definition

; Enum definitions
(enum_specifier
  name: (type_identifier) @enum.name
  body: (enumerator_list) @enum.body) @enum.definition

; Namespace definitions
(namespace_definition
  name: (identifier) @namespace.name
  body: (declaration_list) @namespace.body) @namespace.definition

; Template declarations
(template_declaration
  parameters: (template_parameter_list) @template.params) @template.definition

; Type aliases (using)
(alias_declaration
  name: (type_identifier) @type.name) @type.definition

; Typedef
(type_definition
  declarator: (type_identifier) @type.name) @type.definition

; Constructor definitions
(function_definition
  declarator: (function_declarator
    declarator: (qualified_identifier) @constructor.name)
  body: (compound_statement)) @constructor.definition

; Variable declarations
(declaration
  declarator: (identifier) @variable.name) @variable.definition

; Include directives
(preproc_include
  path: (_) @include.path) @include.definition

; Macro definitions
(preproc_function_def
  name: (identifier) @macro.name
  parameters: (preproc_params) @macro.params) @macro.definition

; Comments
(comment) @comment
