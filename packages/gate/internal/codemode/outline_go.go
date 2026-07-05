package codemode

import (
	"go/ast"
	"go/parser"
	"go/token"
	"strings"
)

func extractGoOutline(text, path string) ([]string, bool) {
	fset := token.NewFileSet()
	node, err := parser.ParseFile(fset, path, text, parser.ParseComments)
	if err != nil {
		return nil, false
	}

	var sigs []string
	if node.Name != nil {
		sigs = append(sigs, "package "+node.Name.Name)
	}

	for _, imp := range node.Imports {
		sigs = append(sigs, formatImport(imp))
	}

	for _, decl := range node.Decls {
		switch d := decl.(type) {
		case *ast.FuncDecl:
			sigs = append(sigs, formatGoDecl(d.Doc, formatFuncDecl(d)))
		case *ast.GenDecl:
			for _, spec := range d.Specs {
				switch s := spec.(type) {
				case *ast.TypeSpec:
					sigs = append(sigs, formatGoDecl(docFor(d, s), formatTypeSpec(s)))
				case *ast.ValueSpec:
					sigs = append(sigs, formatGoDecl(docFor(d, s), formatValueSpec(d.Tok, s)))
				}
			}
		}
	}

	if len(sigs) == 0 {
		return nil, false
	}
	return sigs, true
}

func formatGoDecl(doc *ast.CommentGroup, sig string) string {
	if doc == nil {
		return sig
	}
	comment := strings.TrimSpace(doc.Text())
	if comment == "" {
		return sig
	}
	return truncateLine("// "+strings.ReplaceAll(comment, "\n", " "), 200) + "\n" + sig
}

func docFor(decl *ast.GenDecl, spec ast.Spec) *ast.CommentGroup {
	switch s := spec.(type) {
	case *ast.TypeSpec:
		if s.Doc != nil {
			return s.Doc
		}
	case *ast.ValueSpec:
		if s.Doc != nil {
			return s.Doc
		}
	}
	return decl.Doc
}

func formatImport(spec *ast.ImportSpec) string {
	if spec.Name != nil {
		return "import " + spec.Name.Name + " " + spec.Path.Value
	}
	return "import " + spec.Path.Value
}

func formatFuncDecl(d *ast.FuncDecl) string {
	var b strings.Builder
	if d.Recv != nil {
		b.WriteString(formatFieldList(d.Recv))
		b.WriteString(" ")
	}
	b.WriteString("func ")
	if d.Name != nil {
		b.WriteString(d.Name.Name)
	}
	if d.Type != nil {
		b.WriteString(formatFuncType(d.Type))
	}
	return b.String()
}

func formatFuncType(ft *ast.FuncType) string {
	var b strings.Builder
	b.WriteString(formatFieldList(ft.Params))
	if ft.Results != nil {
		b.WriteString(" ")
		b.WriteString(formatFieldList(ft.Results))
	}
	return b.String()
}

func formatFieldList(fl *ast.FieldList) string {
	if fl == nil {
		return "()"
	}
	var parts []string
	for _, f := range fl.List {
		names := make([]string, len(f.Names))
		for i, n := range f.Names {
			names[i] = n.Name
		}
		typeName := formatExprType(f.Type)
		switch len(names) {
		case 0:
			parts = append(parts, typeName)
		case 1:
			parts = append(parts, names[0]+" "+typeName)
		default:
			parts = append(parts, strings.Join(names, ", ")+" "+typeName)
		}
	}
	inner := strings.Join(parts, ", ")
	if fl.NumFields() == 1 && len(fl.List[0].Names) <= 1 && !needsParens(fl.List[0].Type) {
		return "(" + inner + ")"
	}
	return "(" + inner + ")"
}

func needsParens(expr ast.Expr) bool {
	switch expr.(type) {
	case *ast.FuncType, *ast.InterfaceType, *ast.StructType, *ast.MapType, *ast.ChanType:
		return true
	default:
		return false
	}
}

func formatExprType(expr ast.Expr) string {
	switch t := expr.(type) {
	case *ast.Ident:
		return t.Name
	case *ast.StarExpr:
		return "*" + formatExprType(t.X)
	case *ast.ArrayType:
		return "[]" + formatExprType(t.Elt)
	case *ast.MapType:
		return "map[" + formatExprType(t.Key) + "]" + formatExprType(t.Value)
	case *ast.SelectorExpr:
		return formatExprType(t.X) + "." + t.Sel.Name
	case *ast.InterfaceType:
		return "interface{}"
	case *ast.StructType:
		return "struct{...}"
	case *ast.Ellipsis:
		return "..." + formatExprType(t.Elt)
	default:
		return "..."
	}
}

func formatTypeSpec(s *ast.TypeSpec) string {
	var b strings.Builder
	b.WriteString("type ")
	b.WriteString(s.Name.Name)
	if s.Type != nil {
		switch t := s.Type.(type) {
		case *ast.InterfaceType:
			b.WriteString(" interface")
			if t.Methods != nil && t.Methods.NumFields() > 0 {
				b.WriteString("{...}")
			} else {
				b.WriteString("{}")
			}
		case *ast.StructType:
			b.WriteString(" struct{...}")
		default:
			b.WriteString(" ")
			b.WriteString(formatExprType(s.Type))
		}
	}
	return b.String()
}

func formatValueSpec(tok token.Token, s *ast.ValueSpec) string {
	names := make([]string, len(s.Names))
	for i, n := range s.Names {
		names[i] = n.Name
	}
	prefix := tok.String()
	if s.Type != nil {
		return prefix + " " + strings.Join(names, ", ") + " " + formatExprType(s.Type)
	}
	return prefix + " " + strings.Join(names, ", ")
}
