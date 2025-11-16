; Function definitions
(function_item
  name: (identifier) @function.name
  parameters: (parameters) @function.params
  body: (block) @function.body) @function.definition

; Struct definitions
(struct_item
  name: (type_identifier) @struct.name
  body: (_)? @struct.body) @struct.definition

; Enum definitions
(enum_item
  name: (type_identifier) @enum.name
  body: (enum_variant_list) @enum.body) @enum.definition

; Trait definitions
(trait_item
  name: (type_identifier) @trait.name
  body: (declaration_list) @trait.body) @trait.definition

; Impl blocks
(impl_item
  trait: (type_identifier)? @impl.trait
  type: (type_identifier) @impl.type
  body: (declaration_list
    (function_item
      name: (identifier) @method.name
      parameters: (parameters) @method.params
      body: (block) @method.body) @method.definition))

; Type aliases
(type_item
  name: (type_identifier) @type.name) @type.definition

; Constants
(const_item
  name: (identifier) @constant.name) @constant.definition

; Static variables
(static_item
  name: (identifier) @variable.name) @variable.definition

; Module declarations
(mod_item
  name: (identifier) @module.name) @module.definition

; Use statements (imports)
(use_declaration
  argument: (_) @import.name) @import.definition

; Doc comments
(line_comment) @comment
(block_comment) @comment

; Attribute macros
(attribute_item
  (identifier) @attribute.name)
