## Project context

### Stack
- Framework: Flutter 3.x
- Language: Dart
- Target: Web (flutter build web)

### File structure convention
- Entry point: lib/main.dart
- Widgets in separate files: lib/widgets/widget_name.dart
- Theme in: lib/theme.dart
- Main page: lib/pages/home_page.dart

### Component structure
Each widget should be a separate file:
- lib/widgets/header.dart
- lib/widgets/sidebar.dart
- lib/widgets/main_content.dart
- lib/widgets/step_item.dart
- lib/widgets/info_box.dart
- etc.

### Additional rules
- Use StatelessWidget for layout components
- Define all colors and text styles in lib/theme.dart as static constants
- Use Column, Row, Expanded, Container, Padding for layout
- Use SingleChildScrollView for scrollable content
- Use Google Fonts or system font (no custom font files)
- pubspec.yaml must include flutter SDK dependency
- All styles inline via Flutter widget properties (Flutter does not use CSS)
