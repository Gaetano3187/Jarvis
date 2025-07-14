import React, { Fragment } from 'react'

import PropTypes from 'prop-types'
import { useTranslations } from 'next-intl'

const CTA41 = (props) => {
  return (
    <>
      <div
        className={`cta41-container1 thq-section-padding ${props.rootClassName} `}
      >
        <div className="cta41-max-width thq-section-max-width">
          <div className="cta41-container2 thq-flex-row">
            <div className="cta41-column">
              <button type="button" className="thq-button-outline">
                <span>
                  {props.action2 ?? (
                    <Fragment>
                      <span className="cta41-text3">Action2</span>
                    </Fragment>
                  )}
                </span>
              </button>
              <button type="button" className="thq-button-filled">
                <span>
                  {props.action1 ?? (
                    <Fragment>
                      <span className="cta41-text4">Action1</span>
                    </Fragment>
                  )}
                </span>
              </button>
              <div className="cta41-actions"></div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>
        {`
          .cta41-container1 {
            width: 100%;
            height: auto;
            display: flex;
            position: relative;
            align-items: flex-start;
            flex-direction: column;
          }
          .cta41-max-width {
            gap: 80px;
            width: 100%;
            height: auto;
            display: flex;
            overflow: hidden;
            max-width: var(--dl-layout-size-maxwidth);
            align-self: center;
            align-items: flex-start;
            flex-shrink: 0;
            flex-direction: column;
          }
          .cta41-container2 {
            align-self: stretch;
            align-items: center;
            flex-shrink: 0;
          }
          .cta41-column {
            gap: var(--dl-layout-space-oneandhalfunits);
            display: flex;
            flex-grow: 1;
            align-items: flex-start;
            flex-direction: column;
          }
          .cta41-actions {
            gap: var(--dl-layout-space-oneandhalfunits);
            border: 2px dashed rgba(120, 120, 120, 0.4);
            display: flex;
            align-items: flex-start;
          }
          .cta41-text3 {
            display: inline-block;
          }
          .cta41-text4 {
            display: inline-block;
          }
          @media (max-width: 1600px) {
            .cta41-column {
              width: 1297px;
              height: 120px;
            }
          }
          @media (max-width: 991px) {
            .cta41-container2 {
              flex-direction: column;
            }
          }
        `}
      </style>
    </>
  )
}

CTA41.defaultProps = {
  rootClassName: '',
  action2: undefined,
  action1: undefined,
}

CTA41.propTypes = {
  rootClassName: PropTypes.string,
  action2: PropTypes.element,
  action1: PropTypes.element,
}

export default CTA41
