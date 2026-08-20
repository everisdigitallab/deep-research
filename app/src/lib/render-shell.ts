export function renderShell() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Application Portal</title>
  <link rel="icon" href="data:,">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wght@0,300;0,400;0,700;1,400&family=Noto+Serif:wght@400;700&display=swap" rel="stylesheet">
  <link href="/static/styles.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            'future-blue': '#0072BC',
            'future-blue-150': '#005B96',
            'future-blue-50': '#19A3FC',
            'smart-navy': '#070F26',
            'turquoise': '#00DFED',
            'green-a': '#00CB5D',
            'yellow-a': '#FFC400',
            'orange-a': '#FF7A00',
            'text-gray': '#2E404D',
            'gray-50': '#E8E8E8',
            'gray-100': '#949494'
          },
          fontFamily: {
            sans: ['Noto Sans', 'Arial', 'sans-serif'],
            serif: ['Noto Serif', 'Georgia', 'serif']
          }
        }
      }
    }
  </script>
</head>
<body class="bg-white text-text-gray font-sans antialiased">
  <div id="app"></div>
  <script src="/static/js/api.js"></script>
  <script src="/static/js/state.js"></script>
  <script src="/static/js/layout.js"></script>
  <script src="/static/js/views/auth-views.js"></script>
  <script src="/static/js/views/dashboard-view.js"></script>
  <script src="/static/js/views/admin-view.js"></script>
  <script src="/static/js/views/audit-view.js"></script>
  <script src="/static/js/router.js"></script>
</body>
</html>`
}
