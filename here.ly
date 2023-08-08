
\version "2.24.1"

\paper {
  ragged-right = ##f
}

\score {
  <<
  \new Staff {
    \clef treble
    \time 3/4
    \new Voice = "11" {
      <<
        {
          \voiceOne
          <e'  a'>8  c'8  <e'  b'>8  d'8  <e'  c''>8  c'8  
        }
      >>
      \oneVoice
    }|

    \new Voice = "12" {
      <<
        {
          \voiceOne
          <e'  b'>8  d'8  <e'  a'>8  c'8  <e'  b'>8  d'8  
        }
      >>
      \oneVoice
    }|

    \new Voice = "13" {
      <<
        {
          \voiceOne
          c''2.  
        }
        \new Voice {
          \voiceTwo
          e'8  e'8  e'8  e'8  e'8  e'8  
        }
      >>
      \oneVoice
    }|

    \new Voice = "14" {
      <<
        {
          \voiceOne
          b'2.  
        }
        \new Voice {
          \voiceTwo
          e'8  d'8  e'8  d'8  e'8  d'8  
        }
      >>
      \oneVoice
    }|

  }

  \new Staff {
    \clef bass
    \time 3/4
    \new Voice = "21" {
      <<
        {
          \voiceFour
          <a,  a>4  <b,  b>4  <c  c'>4  
        }
      >>
      \oneVoice
    }|

    \new Voice = "22" {
      <<
        {
          \voiceFour
          <b,  b>4  <a,  a>4  <b,  b>4  
        }
      >>
      \oneVoice
    }|

    \new Voice = "23" {
      <<
        {
          \voiceFour
          <c  c'>2.  
        }
      >>
      \oneVoice
    }|

    \new Voice = "24" {
      <<
        {
          \voiceFour
          <b,  b>2.  
        }
      >>
      \oneVoice
    }|

  }

  >>
}
