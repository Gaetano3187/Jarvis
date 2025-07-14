import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const GlassCard = (props) => {
  return (
    <>
      <div className="glass-card-container1">
        <div className="glass-card border-hud-cyan/20 rounded-lg backdrop-blur-md p-4 border">
          <span>
            {props.text ?? (
              <Fragment>
                <span className="glass-card-text2">Glass Card</span>
              </Fragment>
            )}
          </span>
        </div>
      </div>
      <style jsx>
        {`
          .glass-card-container1 {
            width: 100%;
            height: 400px;
            display: flex;
            position: relative;
            align-items: flex-start;
            flex-direction: column;
          }
          .glass-card-text2 {
            display: inline-block;
          }
        `}
      </style>
    </>
  )
}

GlassCard.defaultProps = {
  text: undefined,
}

GlassCard.propTypes = {
  text: PropTypes.element,
}

export default GlassCard
