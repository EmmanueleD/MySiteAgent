# Carousel

Carosello di immagini o contenuti con navigazione manuale tramite frecce e indicatori.

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| items | array | true | - | Array di oggetti con image (URL immagine), title (titolo opzionale), description (descrizione opzionale) |
| autoplay | boolean | false | false | Abilita lo scorrimento automatico |
| interval | number | false | 5000 | Intervallo in millisecondi tra le slide se autoplay è attivo |

## Items Structure

Ogni elemento dell'array items deve avere:

- `image` (string, required): URL dell'immagine
- `title` (string, optional): Titolo della slide
- `description` (string, optional): Descrizione della slide

## Esempi

### Carosello base

```astro
<Carousel 
  items={[
    { image: '/images/slide1.jpg', title: 'Prima slide' },
    { image: '/images/slide2.jpg', title: 'Seconda slide' }
  ]} 
/>
```

### Con autoplay

```astro
<Carousel 
  items={[
    { image: '/images/slide1.jpg', title: 'Prima slide', description: 'Descrizione' },
    { image: '/images/slide2.jpg', title: 'Seconda slide' }
  ]}
  autoplay={true}
  interval={3000}
/>
```

## Accessibilità

- I pulsanti di navigazione hanno aria-label descrittivi
- Gli indicatori hanno aria-label che indica il numero della slide
- Il carosello si ferma quando il mouse è sopra per permettere la lettura
