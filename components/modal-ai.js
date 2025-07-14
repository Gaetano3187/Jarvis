import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const ModalAI = (props) => {
  return (
    <>
      <div className="modal-ai-container1">
        <div className="hud-glow bg-hud-800 modal-ai rounded-lg p-6">
          <span>
            {props.text ?? (
              <Fragment>
                <span className="modal-ai-text2">Modal AI</span>
              </Fragment>
            )}
          </span>
          <br></br>
        </div>
      </div>
      <style jsx>
        {`
          .modal-ai-container1 {
            width: 100%;
            height: 400px;
            display: flex;
            position: relative;
            align-items: flex-start;
            flex-direction: column;
          }
          .modal-ai-text2 {
            display: inline-block;
          }
        `}
      </style>
    </>
  )
}

ModalAI.defaultProps = {
  text: undefined,
}

ModalAI.propTypes = {
  text: PropTypes.element,
}

export default ModalAI
