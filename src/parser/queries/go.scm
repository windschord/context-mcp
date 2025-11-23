; Function declarations
(function_declaration
  name: (identifier) @function.name
  parameters: (parameter_list) @function.params
  body: (block) @function.body) @function.definition

; Method declarations
(method_declaration
  receiver: (parameter_list) @method.receiver
  name: (field_identifier) @method.name
  parameters: (parameter_list) @method.params
  body: (block) @method.body) @method.definition

; Type declarations (structs, interfaces)
(type_declaration
  (type_spec
    name: (type_identifier) @struct.name
    type: (struct_type) @struct.body)) @struct.definition

(type_declaration
  (type_spec
    name: (type_identifier) @interface.name
    type: (interface_type) @interface.body)) @interface.definition

; Type aliases
(type_declaration
  (type_spec
    name: (type_identifier) @type.name)) @type.definition

; Constants
(const_declaration
  (const_spec
    name: (identifier) @constant.name)) @constant.definition

; Variables
(var_declaration
  (var_spec
    name: (identifier) @variable.name)) @variable.definition

; Short variable declarations - capture all identifiers
(short_var_declaration
  left: (expression_list
    (identifier) @variable.name)*) @variable.definition

; Import declarations
(import_declaration
  (import_spec
    path: (interpreted_string_literal) @import.path)) @import.definition

; Package declaration
(package_clause
  (package_identifier) @package.name)

; Comments
(comment) @comment
