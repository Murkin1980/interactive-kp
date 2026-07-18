# Demo definition format

Store one UTF-8 JSON object in `public/demos/<slug>/demo.json`.

```json
{
  "slug": "client-proposal",
  "title": "КП глазами клиента",
  "description": "Short intro",
  "duration": "около 1 минуты",
  "steps": [
    {
      "image": "/demos/client-proposal/01.png",
      "title": "Step title",
      "description": "What the user learns",
      "hotspot": {
        "x": 10,
        "y": 20,
        "width": 30,
        "height": 12,
        "next": 1,
        "label": "Visible action name"
      }
    }
  ]
}
```

All hotspot geometry values are percentages from 0 to 100. `next` is a zero-based step index and may be omitted to advance by one. `hotspot` may be omitted on an informational or final step.
