const button = document.querySelector('#health-check')
const result = document.querySelector('#result')

button.addEventListener('click', async () => {
  result.textContent = 'Loading...'

  try {
    const response = await fetch('/api/health')
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    result.textContent = JSON.stringify(await response.json(), null, 2)
  } catch (error) {
    result.textContent = error.message
  }
})
