; Function definitions
(function_definition
  name: (identifier) @function.name
  parameters: (parameters) @function.params
  body: (block) @function.body) @function.definition

; Class definitions
(class_definition
  name: (identifier) @class.name
  body: (block) @class.body) @class.definition

; Method definitions (functions inside classes)
(class_definition
  body: (block
    (function_definition
      name: (identifier) @method.name
      parameters: (parameters) @method.params
      body: (block) @method.body) @method.definition))

; Variable assignments
(assignment
  left: (identifier) @variable.name) @variable.definition

; Import statements
(import_statement
  name: (dotted_name) @import.name) @import.definition

(import_from_statement
  module_name: (dotted_name) @import.module) @import.definition

; Decorators (can indicate special functions/classes)
(decorator
  (identifier) @decorator.name)

; Docstrings
(function_definition
  body: (block
    (expression_statement
      (string) @docstring)))

(class_definition
  body: (block
    (expression_statement
      (string) @docstring)))

; Comments
(comment) @comment
